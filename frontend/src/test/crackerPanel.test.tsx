import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrackerPanel } from '../components/CrackerPanel';
import { clearRawPackets, recordRawPacket, resetRawPacketStore } from '../stores/rawPacketStore';
import type { RawPacket } from '../types';

vi.mock('meshcore-hashtag-cracker', () => ({
  GroupTextCracker: class {
    isGpuAvailable() {
      return false;
    }
    destroy() {}
    setWordlist() {}
    abort() {}
  },
}));

vi.mock('nosleep.js', () => ({
  default: class {
    enable() {}
    disable() {}
  },
}));

vi.mock('../api', () => ({
  api: {
    getUndecryptedPacketCount: vi.fn(),
  },
}));

vi.mock('../components/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { api } from '../api';

const mockedApi = vi.mocked(api);

function groupTextPacket(id: number): RawPacket {
  return {
    id,
    observation_id: id,
    timestamp: id,
    data: `packet-data-${id}`,
    payload_type: 'GROUP_TEXT',
    decrypted: false,
    rssi: null,
    snr: null,
    decrypted_info: null,
  };
}

describe('CrackerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getUndecryptedPacketCount.mockResolvedValue({ count: 0 });
    resetRawPacketStore();
  });

  it('allows clearing max length while editing', async () => {
    render(<CrackerPanel channels={[]} onChannelCreate={vi.fn()} visible={false} />);

    await waitFor(() => {
      expect(mockedApi.getUndecryptedPacketCount).toHaveBeenCalled();
    });

    const maxLengthInput = screen.getByLabelText('Max Length:') as HTMLInputElement;
    fireEvent.change(maxLengthInput, { target: { value: '' } });

    expect(maxLengthInput.value).toBe('');
  });

  it(
    'regression: still enqueues freshly loaded packets when the undecrypted ' +
      'count plateaus across a single buffer update (personal-fork fix, not upstream)',
    async () => {
      act(() => {
        recordRawPacket(groupTextPacket(1));
        recordRawPacket(groupTextPacket(2));
      });

      render(<CrackerPanel channels={[]} onChannelCreate={vi.fn()} visible />);

      await waitFor(() => expect(screen.getByText(/Pending:/)).toHaveTextContent('Pending: 2'));

      // Single commit: the buffer goes straight from {1,2} to {3,4} — same
      // length (2), completely different ids. This is what a history fetch
      // landing while other packets are simultaneously trimmed from the
      // buffer produces. The old `undecryptedGroupText.length` dependency
      // never re-ran for a 2 -> 2 transition, so 3 and 4 were silently never
      // queued and Pending stayed frozen at 2 forever. Queue entries are
      // never pruned when a packet leaves the buffer, so the fixed behavior
      // is 2 (stale) + 2 (newly enqueued) = 4, not a clean 2.
      act(() => {
        clearRawPackets();
        recordRawPacket(groupTextPacket(3));
        recordRawPacket(groupTextPacket(4));
      });

      await waitFor(() => expect(screen.getByText(/Pending:/)).toHaveTextContent('Pending: 4'));
    }
  );
});
