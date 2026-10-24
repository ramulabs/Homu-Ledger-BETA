import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);
Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 0);
window.cancelAnimationFrame = (id) => window.clearTimeout(id);
