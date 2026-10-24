import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { readViewportHeight } from "@/lib/viewport";

const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
afterEach(() => {
  if (original) Object.defineProperty(window, "visualViewport", original);
  else Reflect.deleteProperty(window, "visualViewport");
});
describe("keyboard viewport", () => {
  it("tracks reduced keyboard height and Safari's viewport pan together", async () => {
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    const { result } = renderHook(() => useVisualViewport(true));
    await waitFor(() => expect(result.current.height).toBe(800));
    act(() => { viewport.height = 380; viewport.offsetTop = 42; viewport.dispatchEvent(new Event("resize")); });
    expect(result.current).toEqual({ height: 380, offsetTop: 42 });
    act(() => { viewport.height = 800; viewport.offsetTop = 0; viewport.dispatchEvent(new Event("scroll")); });
    expect(result.current).toEqual({ height: 800, offsetTop: 0 });
  });
  it("falls back to the window height for missing or zero viewport values", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: 0 } });
    expect(readViewportHeight()).toBe(window.innerHeight);
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
    expect(readViewportHeight()).toBe(window.innerHeight);
  });
  it("unsubscribes while closed and re-reads geometry when reopened", async () => {
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    const { result, rerender } = renderHook(({ open }) => useVisualViewport(open), { initialProps: { open: true } });
    await waitFor(() => expect(result.current.height).toBe(800));
    rerender({ open: false });
    act(() => { viewport.height = 400; viewport.dispatchEvent(new Event("resize")); });
    expect(result.current.height).toBe(800);
    rerender({ open: true });
    await waitFor(() => expect(result.current.height).toBe(400));
  });
});
