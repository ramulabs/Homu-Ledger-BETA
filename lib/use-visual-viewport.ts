"use client";

import { useEffect, useState } from "react";
import { readViewportHeight, readViewportOffsetTop } from "@/lib/viewport";

/** One viewport contract for every editable sheet, including Safari panning.
 * Start identically on server/client; only subscribe while the sheet is open.
 * Viewport movement follows the keyboard immediately, never a CSS animation.
 */
export function useVisualViewport(open: boolean) {
  const [viewport, setViewport] = useState<{ height: number | null; offsetTop: number }>({ height: null, offsetTop: 0 });
  useEffect(() => {
    if (!open) return;
    const visual = window.visualViewport;
    function update() {
      const height = readViewportHeight();
      const offsetTop = readViewportOffsetTop();
      setViewport((previous) => previous.height === height && previous.offsetTop === offsetTop ? previous : { height, offsetTop });
    }
    const frame = requestAnimationFrame(update);
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(frame);
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [open]);
  return viewport;
}
