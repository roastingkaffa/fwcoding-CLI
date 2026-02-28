import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSizeOutput,
  parseMapFile,
  computeMemoryReport,
  parseSizeString,
  formatMemoryTable,
} from "../../../src/tools/memory-analysis.js";

describe("parseSizeOutput", () => {
  it("parses Berkeley format output", () => {
    const output = `   text\t   data\t    bss\t    dec\t    hex\tfilename
  24576\t   1024\t   2048\t  27648\t   6c00\tfirmware.elf`;

    const result = parseSizeOutput(output);
    assert.ok(result !== null);
    assert.equal(result!.text, 24576);
    assert.equal(result!.data, 1024);
    assert.equal(result!.bss, 2048);
    assert.equal(result!.total, 27648);
  });

  it("handles extra whitespace", () => {
    const output = `   text    data     bss     dec     hex filename
   8192     512    1024    9728    2600 app.elf`;

    const result = parseSizeOutput(output);
    assert.ok(result !== null);
    assert.equal(result!.text, 8192);
    assert.equal(result!.data, 512);
    assert.equal(result!.bss, 1024);
  });

  it("returns null for unparseable input", () => {
    assert.equal(parseSizeOutput("not valid output"), null);
    assert.equal(parseSizeOutput(""), null);
  });
});

describe("parseMapFile", () => {
  it("extracts sections from .map content", () => {
    const content = `
.text           0x08000000    0x3000
.data           0x20000000     0x400
.bss            0x20000400     0x200
.debug_info     0x00000000    0x1000
`;
    const sections = parseMapFile(content);
    assert.equal(sections.length, 4);
    assert.deepEqual(sections[0], { name: ".text", address: 0x08000000, size: 0x3000 });
    assert.deepEqual(sections[1], { name: ".data", address: 0x20000000, size: 0x400 });
    assert.deepEqual(sections[2], { name: ".bss", address: 0x20000400, size: 0x200 });
  });

  it("skips zero-size sections", () => {
    const content = `.empty          0x00000000    0x0\n.text           0x08000000    0x100`;
    const sections = parseMapFile(content);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].name, ".text");
  });

  it("returns empty array for no sections", () => {
    assert.deepEqual(parseMapFile("no sections here"), []);
  });
});

describe("computeMemoryReport", () => {
  it("calculates flash and ram usage", () => {
    const report = computeMemoryReport(
      { text: 24576, data: 1024, bss: 2048, total: 27648 },
      512 * 1024, // 512K flash
      128 * 1024  // 128K ram
    );

    // Flash = text + data = 25600
    assert.equal(report.flash_used, 25600);
    assert.equal(report.flash_total, 524288);
    // RAM = data + bss = 3072
    assert.equal(report.ram_used, 3072);
    assert.equal(report.ram_total, 131072);
    // Percentages
    assert.ok(Math.abs(report.flash_percent - 4.88) < Math.pow(10, -1));
    assert.ok(Math.abs(report.ram_percent - 2.34) < Math.pow(10, -1));
  });

  it("handles zero totals", () => {
    const report = computeMemoryReport(
      { text: 100, data: 50, bss: 30, total: 180 },
      0,
      0
    );
    assert.equal(report.flash_percent, 0);
    assert.equal(report.ram_percent, 0);
  });

  it("includes optional sections", () => {
    const sections = [{ name: ".text", address: 0x08000000, size: 0x100 }];
    const report = computeMemoryReport(
      { text: 256, data: 0, bss: 0, total: 256 },
      1024,
      1024,
      sections
    );
    assert.equal(report.sections!.length, 1);
  });
});

describe("parseSizeString", () => {
  it("parses kilobytes", () => {
    assert.equal(parseSizeString("512K"), 524288);
    assert.equal(parseSizeString("128k"), 131072);
  });

  it("parses megabytes", () => {
    assert.equal(parseSizeString("1M"), 1048576);
    assert.equal(parseSizeString("2m"), 2097152);
  });

  it("parses plain bytes", () => {
    assert.equal(parseSizeString("1024"), 1024);
  });

  it("handles KB/MB suffix", () => {
    assert.equal(parseSizeString("512KB"), 524288);
  });

  it("returns 0 for invalid input", () => {
    assert.equal(parseSizeString("abc"), 0);
    assert.equal(parseSizeString(""), 0);
  });
});

describe("formatMemoryTable", () => {
  it("produces a formatted table", () => {
    const report = computeMemoryReport(
      { text: 24576, data: 1024, bss: 2048, total: 27648 },
      512 * 1024,
      128 * 1024
    );
    const table = formatMemoryTable(report);
    assert.ok(table.includes("Flash"));
    assert.ok(table.includes("RAM"));
    assert.ok(table.includes("%"));
  });
});
