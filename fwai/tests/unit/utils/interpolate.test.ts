import { interpolate } from "../../../src/utils/interpolate.js";

describe("interpolate", () => {
  it("substitutes simple variables", () => {
    expect(interpolate("Hello ${name}", { name: "world" })).toBe("Hello world");
  });

  it("substitutes multiple variables", () => {
    expect(
      interpolate("${greeting} ${name}!", { greeting: "Hi", name: "fwai" })
    ).toBe("Hi fwai!");
  });

  it("supports nested keys", () => {
    const vars = {
      project: { serial: { port: "/dev/ttyUSB0" }, target: { mcu: "STM32F407" } },
    };
    expect(interpolate("Port: ${project.serial.port}", vars)).toBe(
      "Port: /dev/ttyUSB0"
    );
    expect(interpolate("MCU: ${project.target.mcu}", vars)).toBe(
      "MCU: STM32F407"
    );
  });

  it("leaves unresolved variables as-is", () => {
    expect(interpolate("${missing}", {})).toBe("${missing}");
    expect(interpolate("${a.b.c}", { a: { b: {} } })).toBe("${a.b.c}");
  });

  it("handles templates with no variables", () => {
    expect(interpolate("no vars here", { foo: "bar" })).toBe("no vars here");
  });

  it("converts non-string values to string", () => {
    expect(interpolate("count: ${n}", { n: 42 })).toBe("count: 42");
    expect(interpolate("flag: ${b}", { b: true })).toBe("flag: true");
  });

  it("handles empty template", () => {
    expect(interpolate("", { x: "y" })).toBe("");
  });

  it("handles adjacent variables", () => {
    expect(interpolate("${a}${b}", { a: "hello", b: "world" })).toBe(
      "helloworld"
    );
  });

  it("handles null/undefined nested values gracefully", () => {
    expect(interpolate("${a.b}", { a: null })).toBe("${a.b}");
    expect(interpolate("${a.b}", { a: undefined })).toBe("${a.b}");
  });
});
