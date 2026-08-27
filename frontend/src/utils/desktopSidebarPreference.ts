// Browser-local preference for collapsing the desktop sidebar to reclaim
// screen space. Desktop-only — the mobile sidebar is always a slide-over
// sheet and isn't affected by this. Stored per-browser in localStorage.

export const DESKTOP_SIDEBAR_COLLAPSED_KEY = 'remoteterm-desktop-sidebar-collapsed';

export function getSavedDesktopSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(DESKTOP_SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSavedDesktopSidebarCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(DESKTOP_SIDEBAR_COLLAPSED_KEY, 'true');
    } else {
      localStorage.removeItem(DESKTOP_SIDEBAR_COLLAPSED_KEY);
    }
  } catch {
    // localStorage may be unavailable
  }
}
