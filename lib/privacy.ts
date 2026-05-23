// Privacy toggle — RAM-15.
// Mirrors the homu-theme pattern: a single localStorage key, applied to
// <html> by the bootstrap script in app/layout.tsx before first paint
// (so masked totals never flash the real number on cold load).
//
// Privacy is ON by default for everyone. The localStorage key only stores
// the OPT-OUT — "0" means the user has explicitly turned the toggle off;
// missing (or "1") means the privacy mask is active. This way existing
// users who never visited the toggle still pick up the default-on
// behaviour on the next reload, without a migration.

export const HIDE_AMOUNTS_STORAGE_KEY = "homu-hide-amounts";
const OPT_OUT_VALUE = "0";

/** Replace every digit in a formatted amount with •, keeping the currency
 *  symbol, separators and sign so the row width barely changes when toggled.
 *  Example: "Rp 1.500.000" → "Rp •.•••.•••", "-Rp 50.000" → "-Rp ••.•••". */
export function maskAmount(formatted: string): string {
  return formatted.replace(/\d/g, "•");
}

/** True when the user has the privacy mask on — the default for everyone
 *  unless they've explicitly opted out by setting the key to "0". */
export function readHideAmountsPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(HIDE_AMOUNTS_STORAGE_KEY) !== OPT_OUT_VALUE;
  } catch {
    return true;
  }
}

/** Persist the preference and sync the <html data-hide-amounts> attribute
 *  so every PrivacyAmount + colour override updates immediately. Also clears
 *  any in-session "peek" state so the new setting takes effect cleanly. */
export function writeHideAmountsPref(hide: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (hide) window.localStorage.removeItem(HIDE_AMOUNTS_STORAGE_KEY);
    else window.localStorage.setItem(HIDE_AMOUNTS_STORAGE_KEY, OPT_OUT_VALUE);
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
