"use client";

// Client-side file delivery (RAM-10).
//
// Single seam for "give the user this file" so the export shell never has
// to know whether it's running in a desktop browser, a PWA on iOS, an
// Android TWA, or (eventually) a Capacitor / WKWebView shell. Swapping
// any of those over to a native API later means replacing this file —
// nothing in components/export-shell.tsx or app/api/export needs to change.
//
// Strategy:
//  1. If Web Share Level 2 is available AND the runtime can share files
//     (canShare()), prefer that — best native feel on iOS Safari (16.4+),
//     Android Chrome, and any TWA whose Web Share polyfill forwards to
//     the OS share sheet. The user gets the system "Share to Files /
//     Mail / WhatsApp" affordance, which solves the TWA "where did my
//     download go" UX problem.
//  2. Otherwise, fall back to an in-DOM <a download> click. Works in all
//     desktop browsers + Mobile Safari PWAs that don't support share.
//
// A future Capacitor build can replace this whole module with a version
// that calls @capacitor/filesystem to write to Documents and then
// @capacitor/share to invoke the native share sheet — same signature.

export type DeliverInput = {
  blob: Blob;
  filename: string;
  /** Optional title shown to the OS share-sheet, when sharing is used. */
  shareTitle?: string;
};

export type DeliverResult = {
  /** "share" → handed off to navigator.share. "download" → triggered an <a download>.
   *  "cancelled" → share dialog was opened but the user dismissed it (no fallback
   *  fires; that's expected user intent). */
  method: "share" | "download" | "cancelled";
};

/** Probe whether the runtime can share THIS specific file via the Web Share API.
 *  Wraps the type check + the optional canShare() guard. Splitting it out
 *  makes the export shell able to render a different button label
 *  ("Share" vs "Download") if it wants to. */
export function canShareFile(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  // canShare with `files` is the Web Share Level 2 capability check. Older
  // implementations have `share()` but not `canShare()` and may not accept
  // file payloads — assume "no" in that case rather than fail at runtime.
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function deliverFile({ blob, filename, shareTitle }: DeliverInput): Promise<DeliverResult> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

  // Path 1 — Web Share. Best for mobile / TWA / future native shell.
  if (canShareFile(file)) {
    try {
      await navigator.share({
        files: [file],
        title: shareTitle ?? filename,
      });
      return { method: "share" };
    } catch (err) {
      // AbortError means the user dismissed the share sheet — that's a
      // deliberate "no thanks", not a failure. Do NOT fall back to a
      // download in that case (would be surprising to download a file
      // the user just declined to share).
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) return { method: "cancelled" };
      // Anything else (NotAllowedError, security, browser bug) → fall
      // through to the <a download> path so the user still gets the file.
    }
  }

  // Path 2 — classic blob URL + <a download>. Same pattern used by
  // components/photo-viewer.tsx, which means it's already been battle-
  // tested in Safari (which is finicky about removing the anchor too
  // early).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a beat to start the download before we revoke the
  // blob URL. Less than 1s and Safari sometimes loses the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { method: "download" };
}
