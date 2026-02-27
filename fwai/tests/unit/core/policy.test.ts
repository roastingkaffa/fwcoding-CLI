import { isProtectedPath, checkProtectedPaths } from "../../../src/core/policy.js";

describe("isProtectedPath", () => {
  const protectedPaths = ["boot/**", "*.ld", "src/critical/**"];

  it("matches glob pattern boot/**", () => {
    expect(isProtectedPath("boot/startup.s", protectedPaths)).toBe(true);
    expect(isProtectedPath("boot/vectors.c", protectedPaths)).toBe(true);
  });

  it("matches *.ld pattern", () => {
    expect(isProtectedPath("linker.ld", protectedPaths)).toBe(true);
    expect(isProtectedPath("STM32F407.ld", protectedPaths)).toBe(true);
  });

  it("matches nested protected paths", () => {
    expect(isProtectedPath("src/critical/init.c", protectedPaths)).toBe(true);
  });

  it("does not match non-protected paths", () => {
    expect(isProtectedPath("src/main.c", protectedPaths)).toBe(false);
    expect(isProtectedPath("src/drivers/spi.c", protectedPaths)).toBe(false);
    expect(isProtectedPath("Makefile", protectedPaths)).toBe(false);
  });

  it("returns false for empty protected paths", () => {
    expect(isProtectedPath("boot/startup.s", [])).toBe(false);
  });
});

describe("checkProtectedPaths", () => {
  const protectedPaths = ["boot/**", "*.ld"];

  it("filters changed files to only protected ones", () => {
    const changedFiles = [
      "src/main.c",
      "boot/startup.s",
      "linker.ld",
      "src/app.c",
    ];
    const protected_ = checkProtectedPaths(changedFiles, protectedPaths);
    expect(protected_).toEqual(["boot/startup.s", "linker.ld"]);
  });

  it("returns empty array when no files are protected", () => {
    const changedFiles = ["src/main.c", "src/app.c"];
    const protected_ = checkProtectedPaths(changedFiles, protectedPaths);
    expect(protected_).toEqual([]);
  });

  it("returns empty for empty changed files", () => {
    expect(checkProtectedPaths([], protectedPaths)).toEqual([]);
  });

  it("returns empty for empty protected paths", () => {
    const changedFiles = ["boot/startup.s", "linker.ld"];
    expect(checkProtectedPaths(changedFiles, [])).toEqual([]);
  });
});
