import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  stopSpinner,
  isSpinnerActive,
  pauseSpinner,
} from "../../../src/utils/ui.js";

// ora auto-disables on non-TTY (test environment), so spinners are
// created but produce no visible output. We test state management only.

describe("ui", () => {
  beforeEach(() => {
    // Clean up any leftover spinner state
    stopSpinner();
  });

  describe("startSpinner", () => {
    it("creates an active spinner", () => {
      startSpinner("Loading...");
      assert.equal(isSpinnerActive(), true);
      stopSpinner();
    });

    it("stops previous spinner before starting a new one", () => {
      startSpinner("First");
      assert.equal(isSpinnerActive(), true);
      startSpinner("Second");
      // Still active (new spinner replaced old one)
      assert.equal(isSpinnerActive(), true);
      stopSpinner();
    });
  });

  describe("updateSpinner", () => {
    it("does not throw when spinner is active", () => {
      startSpinner("Initial");
      updateSpinner("Updated");
      stopSpinner();
    });

    it("is a no-op when no spinner active", () => {
      updateSpinner("Nothing");
      assert.equal(isSpinnerActive(), false);
    });
  });

  describe("succeedSpinner", () => {
    it("marks spinner as inactive", () => {
      startSpinner("Working...");
      succeedSpinner("Done!");
      assert.equal(isSpinnerActive(), false);
    });

    it("is a no-op when no spinner active", () => {
      succeedSpinner("Nothing");
      assert.equal(isSpinnerActive(), false);
    });
  });

  describe("failSpinner", () => {
    it("marks spinner as inactive", () => {
      startSpinner("Working...");
      failSpinner("Error!");
      assert.equal(isSpinnerActive(), false);
    });

    it("is a no-op when no spinner active", () => {
      failSpinner("Nothing");
      assert.equal(isSpinnerActive(), false);
    });
  });

  describe("stopSpinner", () => {
    it("stops spinner and marks as inactive", () => {
      startSpinner("Working...");
      stopSpinner();
      assert.equal(isSpinnerActive(), false);
    });

    it("is a no-op when no spinner active", () => {
      stopSpinner();
      assert.equal(isSpinnerActive(), false);
    });
  });

  describe("pauseSpinner", () => {
    it("returns null when no spinner active", () => {
      assert.equal(pauseSpinner(), null);
    });

    it("returns resume function and stops spinner temporarily", () => {
      startSpinner("Working...");
      const resume = pauseSpinner();
      assert.ok(typeof resume === "function");
      // Spinner is paused (stopped) but pauseSpinner doesn't null the ref —
      // the resume function re-starts the same spinner instance
      resume!();
      // After resume, spinner should still be tracked as active
      assert.equal(isSpinnerActive(), true);
      stopSpinner();
    });
  });

  describe("lifecycle", () => {
    it("handles rapid start-stop cycles", () => {
      for (let i = 0; i < 10; i++) {
        startSpinner(`Cycle ${i}`);
        stopSpinner();
      }
      assert.equal(isSpinnerActive(), false);
    });

    it("handles succeed after start", () => {
      startSpinner("Task");
      succeedSpinner("Completed");
      assert.equal(isSpinnerActive(), false);
    });

    it("handles fail after start", () => {
      startSpinner("Task");
      failSpinner("Failed");
      assert.equal(isSpinnerActive(), false);
    });
  });
});
