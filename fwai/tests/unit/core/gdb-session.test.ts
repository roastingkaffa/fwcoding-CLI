import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGDBRegisters, parseGDBBacktrace } from "../../../src/core/gdb-session.js";

describe("gdb-session", () => {
  describe("parseGDBRegisters", () => {
    it("parses register output from 'info registers'", () => {
      const output = `
r0             0x0                 0
r1             0x20000400          536871936
r2             0x8000000           134217728
r3             0xdeadbeef          3735928559
sp             0x20001000          0x20001000
lr             0x80001e5           134218213
pc             0x8000458           0x8000458 <main+8>
`;
      const regs = parseGDBRegisters(output);
      assert.ok(regs);
      assert.equal(regs["r0"], "0x0");
      assert.equal(regs["r1"], "0x20000400");
      assert.equal(regs["r3"], "0xdeadbeef");
      assert.equal(regs["sp"], "0x20001000");
      assert.equal(regs["pc"], "0x8000458");
    });

    it("returns undefined for empty output", () => {
      assert.equal(parseGDBRegisters("no registers here"), undefined);
    });
  });

  describe("parseGDBBacktrace", () => {
    it("parses backtrace with file/line info", () => {
      const output = `
#0  HAL_Init () at Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal.c:147
#1  0x080001e4 in main () at src/main.c:42
#2  0x08000188 in Reset_Handler () at startup/startup_stm32f407.s:76
`;
      const frames = parseGDBBacktrace(output);
      assert.ok(frames);
      assert.equal(frames.length, 3);
      assert.equal(frames[0].level, 0);
      assert.equal(frames[0].function, "HAL_Init");
      assert.ok(frames[0].file?.includes("stm32f4xx_hal.c"));
      assert.equal(frames[0].line, 147);
      assert.equal(frames[1].level, 1);
      assert.equal(frames[1].function, "main");
      assert.equal(frames[1].line, 42);
    });

    it("parses backtrace without file info", () => {
      const output = `
#0  0x08000458 in main ()
#1  0x08000188 in Reset_Handler ()
`;
      const frames = parseGDBBacktrace(output);
      assert.ok(frames);
      assert.equal(frames.length, 2);
      assert.equal(frames[0].function, "main");
      assert.equal(frames[0].file, undefined);
    });

    it("returns undefined for non-backtrace output", () => {
      assert.equal(parseGDBBacktrace("no backtrace here"), undefined);
    });
  });
});
