/**
 * Dynamic ESM import bridge for fwai library.
 * VS Code extensions are CJS; fwai is ESM. Dynamic import() bridges the gap.
 */

import type { FwaiLib } from "../types.js";

let cachedModule: FwaiLib | null = null;

export async function getFwaiLib(): Promise<FwaiLib> {
  if (cachedModule) return cachedModule;
  cachedModule = (await import("fwai/lib")) as unknown as FwaiLib;
  return cachedModule;
}

/** Run a fwai lib function with explicit cwd. */
export async function withCwd<T>(
  fn: (lib: FwaiLib, cwd: string) => T | Promise<T>,
  cwd: string
): Promise<T> {
  const lib = await getFwaiLib();
  return fn(lib, cwd);
}
