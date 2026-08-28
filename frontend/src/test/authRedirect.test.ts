import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAuthRedirectUrl,
  resetAuthRedirectGuard,
  setAuthRedirectUrl,
  triggerAuthRedirect,
} from '../utils/authRedirect';

describe('authRedirect utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthRedirectGuard();
  });

  it('defaults to empty when unset', () => {
    expect(getAuthRedirectUrl()).toBe('');
  });

  it('persists a valid absolute https URL', () => {
    expect(setAuthRedirectUrl('https://auth.example.com/login')).toBeNull();
    expect(getAuthRedirectUrl()).toBe('https://auth.example.com/login');
  });

  it('persists a valid absolute http URL', () => {
    expect(setAuthRedirectUrl('http://auth.example.com/login')).toBeNull();
    expect(getAuthRedirectUrl()).toBe('http://auth.example.com/login');
  });

  it('persists a same-origin relative path', () => {
    expect(setAuthRedirectUrl('/login')).toBeNull();
    expect(getAuthRedirectUrl()).toBe('/login');
  });

  it('trims whitespace before validating and storing', () => {
    expect(setAuthRedirectUrl('  /login  ')).toBeNull();
    expect(getAuthRedirectUrl()).toBe('/login');
  });

  it('clears the setting when given an empty string', () => {
    setAuthRedirectUrl('/login');
    expect(setAuthRedirectUrl('')).toBeNull();
    expect(getAuthRedirectUrl()).toBe('');
  });

  it('rejects a javascript: URL and does not persist it', () => {
    const err = setAuthRedirectUrl('javascript:alert(1)');
    expect(err).not.toBeNull();
    expect(getAuthRedirectUrl()).toBe('');
  });

  it('rejects a protocol-relative URL (not same-origin-safe)', () => {
    const err = setAuthRedirectUrl('//evil.example.com/');
    expect(err).not.toBeNull();
    expect(getAuthRedirectUrl()).toBe('');
  });

  it('rejects a bare, non-URL string', () => {
    const err = setAuthRedirectUrl('not a url');
    expect(err).not.toBeNull();
    expect(getAuthRedirectUrl()).toBe('');
  });

  describe('triggerAuthRedirect', () => {
    let reloadSpy: ReturnType<typeof vi.fn>;
    let originalLocation: Location;

    beforeEach(() => {
      reloadSpy = vi.fn();
      originalLocation = window.location;
      // window.location can't be reassigned directly in jsdom; replace it
      // with a stub object for the duration of these tests.
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, reload: reloadSpy, href: 'http://localhost/' },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    });

    it('reloads the page when no redirect URL is configured', () => {
      triggerAuthRedirect();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('navigates to the configured URL instead of reloading', () => {
      setAuthRedirectUrl('/login');
      triggerAuthRedirect();
      expect(window.location.href).toBe('/login');
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('is idempotent — a second call does nothing until the guard is reset', () => {
      triggerAuthRedirect();
      triggerAuthRedirect();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });
});
