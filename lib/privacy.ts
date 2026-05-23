// Privacy toggle — RAM-15.
// Mirrors the homu-theme pattern: a single localStorage key, applied to
// <html> by the bootstrap script in app/layout.tsx before first paint
// (so masked totals never flash the real number on cold load).

export const HIDE_AMOUNTS_STORAGE_KEY = "homu-hide-amounts";

/** Replace every digit in a formatted amount with •, keeping the currency
 *  symbol, separators and sign so the row width barely changes when toggled.
 *  Example: "Rp 1.500.000" → "Rp •.•••.•••", "-Rp 50.000" → "-Rp ••.•••". */
export function maskAmount(formatted: string): string {
  return formatted.replace(/\d/g, "•");
}

/** Read the persisted "hide amounts" preference. Safe on the server (returns
 *  false). Mainly used by the Settings page; runtime rendering relies on the
 *  data attribute set by the bootstrap script + CSS in app/globals.css. */
export function readHideAmountsPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_AMOUNTS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Write the preference + sync the <html> data attribute so every mounted
 *  PrivacyAmount masks/unmasks immediately. Also clears the in-session
 *  "revealed" peek state so the setting takes effect right away. */
export function writeHideAmountsPref(hide: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (hide) window.localStorage.setItem(HIDE_AMOUNTS_STORAGE_KEY, "1");
    else window.localStorage.removeItem(HIDE_AMOUNTS_STORAGE_KEY);
  } catch {
    // localStorage can throw in private mode / quota — best-effort only.
  }
  const html = document.documentElement;
  if (hide) html.dataset.hideAmounts = "1";
  else delete html.dataset.hideAmounts;
  delete html.dataset.privacyRevealed;
}

/** Flip the in-session peek state set by the eye icon. Not persisted —
 *  every reload starts hidden again when the setting is on. */
export function togglePrivacyReveal(): void {
  if (typeof window === "undefined") return;
  const html = document.documentElement;
  if (html.dataset.privacyRevealed === "1") delete html.dataset.privacyRevealed;
  else html.dataset.privacyRevealed = "1";
}
