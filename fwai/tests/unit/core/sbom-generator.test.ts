import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateSBOM, writeSBOM, formatSBOMSummary } from "../../../src/core/sbom-generator.js";
import type { Project } from "../../../src/schemas/project.schema.js";

function makeProject(): Project {
  return {
    project: {
      name: "test-firmware",
      target: { mcu: "STM32F407" },
      build: { system: "cmake", build_dir: "build", source_dir: "src" },
      serial: { port: "/dev/ttyUSB0", baud: 115200 },
      boot: { success_patterns: ["System Ready"], failure_patterns: ["PANIC"] },
      toolchain: { compiler: "arm-none-eabi-gcc" },
      dependencies: [
        { name: "FreeRTOS", version: "10.5.1", type: "rtos", source: "github.com/FreeRTOS/FreeRTOS" },
        { name: "STM32CubeF4", version: "1.27.0", type: "hal" },
      ],
    },
  };
}

describe("sbom-generator", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwai-sbom-test-"));
    // Create minimal package.json
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({
      dependencies: { zod: "^3.22.0" },
      devDependencies: { typescript: "^5.7.0" },
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates valid CycloneDX structure", () => {
    const bom = generateSBOM(makeProject(), tmpDir);
    assert.equal(bom.bomFormat, "CycloneDX");
    assert.equal(bom.specVersion, "1.5");
    assert.ok(bom.metadata.timestamp);
    assert.ok(Array.isArray(bom.components));
  });

  it("includes npm dependencies from package.json", () => {
    const bom = generateSBOM(makeProject(), tmpDir);
    const npmDeps = bom.components.filter((c) => c.purl?.startsWith("pkg:npm/"));
    assert.ok(npmDeps.length >= 2); // zod + typescript
    assert.ok(npmDeps.some((c) => c.name === "zod"));
  });

  it("includes project dependencies from project.yaml", () => {
    const bom = generateSBOM(makeProject(), tmpDir);
    const projDeps = bom.components.filter((c) => c.name === "FreeRTOS" || c.name === "STM32CubeF4");
    assert.equal(projDeps.length, 2);
    assert.ok(projDeps.some((c) => c.type === "framework")); // rtos → framework
  });

  it("writes SBOM to file", () => {
    const bom = generateSBOM(makeProject(), tmpDir);
    const outPath = path.join(tmpDir, "sbom.json");
    writeSBOM(bom, outPath);
    assert.ok(fs.existsSync(outPath));
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    assert.equal(parsed.bomFormat, "CycloneDX");
  });

  it("formats human-readable summary", () => {
    const bom = generateSBOM(makeProject(), tmpDir);
    const summary = formatSBOMSummary(bom);
    assert.ok(summary.includes("CycloneDX"));
    assert.ok(summary.includes("components"));
  });
});
