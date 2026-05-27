// Camera-capture helper — the swap point for native plugins.
//
// Today: a hidden <input type="file" accept="image/*" capture="environment">
// is appended to the DOM, .click()'d, and the resolved File is returned.
// This works in:
//   • Mobile browsers (Safari, Chrome) — opens the rear camera directly.
//   • Android TWA — same as a mobile browser inside the trusted-web-activity.
//   • iOS Safari PWA — opens the camera; the user then taps "Use Photo".
//   • iOS Capacitor / WKWebView — `capture` is honoured but the native
//     permission UX is rougher than Capacitor's own camera plugin.
//
// The clean native path is `@capacitor/camera` (proper camera UI + a
// first-class permission flow). When we ship the iOS Capacitor wrapper
// we'll branch here: if `getRuntime() === "ios-capacitor"`, call the
// plugin; otherwise keep the <input> path. The signature
// `() => Promise<File | null>` is deliberately the lowest common
// denominator both paths can return — a Blob with a filename.
//
// `null` means "the user cancelled the picker" (closed it without
// choosing a photo). All other failure modes throw.
//
// IMPORTANT: every call appends a fresh, single-use <input> and removes
// it after the change/cancel event resolves. Re-using one input across
// calls would race when the user opens the receipt picker twice without
// having selected the first time (no `change` event fires on cancel in
// Safari, so the listener for the first call would still be alive).

export type CaptureSource = "camera" | "library";

export type CaptureOptions = {
  /** Default "camera" — opens the rear camera. "library" omits the
   *  `capture` attribute so the OS lets the user pick an existing
   *  photo. Used by the "Pick from library" affordance. */
  source?: CaptureSource;
};

/**
 * Prompt the user to capture (or pick) a receipt photo.
 *
 * Returns the resulting File, or null if the user cancelled.
 *
 * Throws when the browser can't summon a file picker at all (very rare
 * — e.g. headless test environments where document is undefined).
 */
export function captureReceiptPhoto(
  options: CaptureOptions = {}
): Promise<File | null> {
  const { source = "camera" } = options;

  if (typeof document === "undefined") {
    return Promise.reject(new Error("Camera capture requires a browser."));
  }

  return new Promise<File | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // `capture="environment"` is the rear camera. Omit it for the
    // gallery path so iOS shows the photo library instead of the
    // camera shutter.
    if (source === "camera") {
      input.setAttribute("capture", "environment");
    }
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";
    input.style.opacity = "0";
    input.tabIndex = -1;

    let resolved = false;

    function cleanup() {
      // Defer removal so the change event has fully bubbled out.
      setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 0);
    }

    function onChange() {
      if (resolved) return;
      resolved = true;
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    }

    // Cancel detection: 'cancel' fires in modern browsers when the
    // user dismisses the picker without choosing a file. Safari
    // historically didn't fire it; the focus return is the most
    // reliable cross-browser signal. We pair both and only resolve
    // (with null) when no file appears within a short tick after focus.
    function onCancel() {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    }

    function onWindowFocus() {
      // Wait a tick for `change` to win the race if a file was picked.
      setTimeout(() => {
        if (resolved) return;
        if (input.files && input.files.length > 0) {
          // The browser fired focus before change — let change resolve.
          return;
        }
        // No file after focus returned → user cancelled.
        resolved = true;
        cleanup();
        resolve(null);
      }, 300);
      window.removeEventListener("focus", onWindowFocus);
    }

    input.addEventListener("change", onChange, { once: true });
    input.addEventListener("cancel", onCancel, { once: true });
    window.addEventListener("focus", onWindowFocus);

    try {
      document.body.appendChild(input);
      input.click();
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error("Failed to open camera."));
    }
  });
}
