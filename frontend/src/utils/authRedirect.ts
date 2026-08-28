// Browser-local setting for what to do when the app hits a 401/403 — from the
// REST API (api.ts) or from repeated WebSocket handshake failures
// (useWebSocket.ts probing /api/health, since browsers don't expose a
// rejected WS handshake's HTTP status to JS). RemoteTerm itself has no auth
// UI (see frontend/AGENTS.md "Security Posture"); this exists for the case
// where an external reverse proxy (Authelia, oauth2-proxy, ...) sits in
// front and its session has expired — without this the app just hangs with
// stale data and no indication anything is wrong. See issue #346.
//
// If a redirect URL is configured, navigate there. Otherwise fall back to a
// full page reload, which lets the proxy's own redirect-to-login kick in.
//
// The stored key is also read directly (duplicated, not imported) by the
// inline pre-React prefetch script in index.html, which runs before any
// module exists — keep the key and fallback behavior here in sync with that
// script if either changes.

const AUTH_REDIRECT_KEY = 'remoteterm-auth-redirect-url';

export function getAuthRedirectUrl(): string {
  try {
    return localStorage.getItem(AUTH_REDIRECT_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Validate and persist the redirect URL. Only http(s) absolute URLs and
 * same-origin relative paths are accepted — anything else (e.g. a
 * `javascript:` URL) could turn a stored setting into script execution on
 * redirect. Pass an empty string to clear the setting (falls back to reload).
 * Returns null on success, or an error string.
 */
export function setAuthRedirectUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed !== '' && !isSafeRedirectUrl(trimmed)) {
    return 'Must be an http(s) URL or a path starting with "/".';
  }
  try {
    if (trimmed === '') {
      localStorage.removeItem(AUTH_REDIRECT_KEY);
    } else {
      localStorage.setItem(AUTH_REDIRECT_KEY, trimmed);
    }
    return null;
  } catch {
    return 'Could not save (localStorage unavailable).';
  }
}

function isSafeRedirectUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

// Guard against a burst of concurrent 401s (several in-flight requests, plus
// the WebSocket) each trying to navigate at once.
let hasRedirected = false;

/** Reset the one-shot guard — for tests only. */
export function resetAuthRedirectGuard(): void {
  hasRedirected = false;
}

export function triggerAuthRedirect(): void {
  if (hasRedirected) return;
  hasRedirected = true;
  const url = getAuthRedirectUrl();
  if (url) {
    window.location.href = url;
  } else {
    window.location.reload();
  }
}
