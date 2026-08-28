import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWebSocket } from '../useWebSocket';
import { api, ApiError } from '../api';
import { resetAuthRedirectGuard } from '../utils/authRedirect';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  send(): void {}
}

const originalWebSocket = globalThis.WebSocket;

describe('useWebSocket lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('does not reconnect after hook unmount cleanup', () => {
    const { unmount } = renderHook(() => useWebSocket({}));

    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      unmount();
    });

    act(() => {
      vi.advanceTimersByTime(3100);
    });

    // Unmount-triggered socket close should not start a new connection.
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});

// Browsers don't expose a rejected WS handshake's HTTP status to JS, so after
// repeated failures the hook probes GET /api/health over HTTP instead. See
// issue #346.
describe('useWebSocket auth-failure detection (issue #346)', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    localStorage.clear();
    resetAuthRedirectGuard();
    reloadSpy = vi.fn();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy, href: 'http://localhost/' },
    });
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  // Close the current (last) socket, flush the resulting getHealth().catch()
  // microtask, then — unless this is meant to be the final failure in a
  // sequence — advance past the 3s reconnect delay so the *next* close acts
  // on a genuinely new connection attempt, not a stale one.
  async function failAndMaybeReconnect(advance: boolean) {
    const instance = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    await act(async () => {
      instance.close();
      await Promise.resolve();
      await Promise.resolve();
    });
    if (advance) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });
    }
  }

  it('probes health and stops reconnecting after 3 consecutive failures with an auth error', async () => {
    vi.spyOn(api, 'getHealth').mockRejectedValue(new ApiError('Not authenticated', 401));

    renderHook(() => useWebSocket({}));
    expect(MockWebSocket.instances).toHaveLength(1);

    await failAndMaybeReconnect(true); // failure 1 -> instance #2
    await failAndMaybeReconnect(true); // failure 2 -> instance #3
    await failAndMaybeReconnect(false); // failure 3 -> probes, redirects, stops reconnecting

    expect(MockWebSocket.instances).toHaveLength(3);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Further time should not start a new connection — auth failure stops reconnecting.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('keeps reconnecting on repeated non-auth failures', async () => {
    vi.spyOn(api, 'getHealth').mockRejectedValue(new TypeError('network error'));

    renderHook(() => useWebSocket({}));

    await failAndMaybeReconnect(true); // failure 1 -> instance #2
    await failAndMaybeReconnect(true); // failure 2 -> instance #3
    await failAndMaybeReconnect(false); // failure 3 -> probes, but not an auth error

    expect(reloadSpy).not.toHaveBeenCalled();

    // A dead server (not an auth wall) should keep reconnecting as before.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('resets the failure count on a successful reconnect, so the probe never fires', async () => {
    const getHealthSpy = vi
      .spyOn(api, 'getHealth')
      .mockRejectedValue(new ApiError('Not authenticated', 401));

    renderHook(() => useWebSocket({}));

    await failAndMaybeReconnect(true); // failure 1 -> instance #2
    await failAndMaybeReconnect(true); // failure 2 -> instance #3

    // A successful open resets the counter back to 0.
    await act(async () => {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].onopen?.();
    });

    await failAndMaybeReconnect(true); // failure 1 (post-reset) -> instance #4
    await failAndMaybeReconnect(false); // failure 2 (post-reset) — never reaches 3

    expect(getHealthSpy).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
