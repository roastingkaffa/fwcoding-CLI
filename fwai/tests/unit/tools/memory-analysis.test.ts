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
    expect(result).not.toBeNull();
    expect(result!.text).toBe(24576);
    expect(result!.data).toBe(1024);
    expect(result!.bss).toBe(2048);
    expect(result!.total).toBe(27648);
  });

  it("handles extra whitespace", () => {
    const output = `   text    data     bss     dec     hex filename
   8192     512    1024    9728    2600 app.elf`;

    const result = parseSizeOutput(output);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(8192);
    expect(result!.data).toBe(512);
    expect(result!.bss).toBe(1024);
  });

  it("returns null for unparseable input", () => {
    expect(parseSizeOutput("not valid output")).toBeNull();
    expect(parseSizeOutput("")).toBeNull();
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
    expect(sections).toHaveLength(4);
    expect(sections[0]).toEqual({ name: ".text", address: 0x08000000, size: 0x3000 });
    expect(sections[1]).toEqual({ name: ".data", address: 0x20000000, size: 0x400 });
    expect(sections[2]).toEqual({ name: ".bss", address: 0x20000400, size: 0x200 });
  });

  it("skips zero-size sections", () => {
    const content = `.empty          0x00000000    0x0\n.text           0x08000000    0x100`;
    const sections = parseMapFile(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe(".text");
  });

  it("returns empty array for no sections", () => {
    expect(parseMapFile("no sections here")).toEqual([]);
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
    expect(report.flash_used).toBe(25600);
    expect(report.flash_total).toBe(524288);
    // RAM = data + bss = 3072
    expect(report.ram_used).toBe(3072);
    expect(report.ram_total).toBe(131072);
    // Percentages
    expect(report.flash_percent).toBeCloseTo(4.88, 1);
    expect(report.ram_percent).toBeCloseTo(2.34, 1);
  });

  it("handles zero totals", () => {
    const report = computeMemoryReport(
      { text: 100, data: 50, bss: 30, total: 180 },
      0,
      0
    );
    expect(report.flash_percent).toBe(0);
    expect(report.ram_percent).toBe(0);
  });

  it("includes optional sections", () => {
    const sections = [{ name: ".text", address: 0x08000000, size: 0x100 }];
    const report = computeMemoryReport(
      { text: 256, data: 0, bss: 0, total: 256 },
      1024,
      1024,
      sections
    );
    expect(report.sections).toHaveLength(1);
  });
});

describe("parseSizeString", () => {
  it("parses kilobytes", () => {
    expect(parseSizeString("512K")).toBe(524288);
    expect(parseSizeString("128k")).toBe(131072);
  });

  it("parses megabytes", () => {
    expect(parseSizeString("1M")).toBe(1048576);
    expect(parseSizeString("2m")).toBe(2097152);
  });

  it("parses plain bytes", () => {
    expect(parseSizeString("1024")).toBe(1024);
  });

  it("handles KB/MB suffix", () => {
    expect(parseSizeString("512KB")).toBe(524288);
  });

  it("returns 0 for invalid input", () => {
    expect(parseSizeString("abc")).toBe(0);
    expect(parseSizeString("")).toBe(0);
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
    expect(table).toContain("Flash");
    expect(table).toContain("RAM");
    expect(table).toContain("%");
  });
});
