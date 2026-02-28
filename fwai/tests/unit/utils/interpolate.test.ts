import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpolate } from "../../../src/utils/interpolate.js";

describe("interpolate", () => {
  it("substitutes simple variables", () => {
    assert.equal(interpolate("Hello ${name}", { name: "world" }), "Hello world");
  });

  it("substitutes multiple variables", () => {
    assert.equal(
      interpolate("${greeting} ${name}!", { greeting: "Hi", name: "fwai" }),
      "Hi fwai!"
    );
  });

  it("supports nested keys", () => {
    const vars = {
      project: { serial: { port: "/dev/ttyUSB0" }, target: { mcu: "STM32F407" } },
    };
    assert.equal(
      interpolate("Port: ${project.serial.port}", vars),
      "Port: /dev/ttyUSB0"
    );
    assert.equal(
      interpolate("MCU: ${project.target.mcu}", vars),
      "MCU: STM32F407"
    );
  });

  it("leaves unresolved variables as-is", () => {
    assert.equal(interpolate("${missing}", {}), "${missing}");
    assert.equal(interpolate("${a.b.c}", { a: { b: {} } }), "${a.b.c}");
  });

  it("handles templates with no variables", () => {
    assert.equal(interpolate("no vars here", { foo: "bar" }), "no vars here");
  });

  it("converts non-string values to string", () => {
    assert.equal(interpolate("count: ${n}", { n: 42 }), "count: 42");
    assert.equal(interpolate("flag: ${b}", { b: true }), "flag: true");
  });

  it("handles empty template", () => {
    assert.equal(interpolate("", { x: "y" }), "");
  });

  it("handles adjacent variables", () => {
    assert.equal(
      interpolate("${a}${b}", { a: "hello", b: "world" }),
      "helloworld"
    );
  });

  it("handles null/undefined nested values gracefully", () => {
    assert.equal(interpolate("${a.b}", { a: null }), "${a.b}");
    assert.equal(interpolate("${a.b}", { a: undefined }), "${a.b}");
  });
});
