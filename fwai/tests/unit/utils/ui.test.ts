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

beforeEach(() => {
  // Clean up any leftover spinner state
  stopSpinner();
});

describe("startSpinner", () => {
  it("creates an active spinner", () => {
    startSpinner("Loading...");
    expect(isSpinnerActive()).toBe(true);
    stopSpinner();
  });

  it("stops previous spinner before starting a new one", () => {
    startSpinner("First");
    expect(isSpinnerActive()).toBe(true);
    startSpinner("Second");
    // Still active (new spinner replaced old one)
    expect(isSpinnerActive()).toBe(true);
    stopSpinner();
  });
});

describe("updateSpinner", () => {
  it("does not throw when spinner is active", () => {
    startSpinner("Initial");
    expect(() => updateSpinner("Updated")).not.toThrow();
    stopSpinner();
  });

  it("is a no-op when no spinner active", () => {
    expect(() => updateSpinner("Nothing")).not.toThrow();
    expect(isSpinnerActive()).toBe(false);
  });
});

describe("succeedSpinner", () => {
  it("marks spinner as inactive", () => {
    startSpinner("Working...");
    succeedSpinner("Done!");
    expect(isSpinnerActive()).toBe(false);
  });

  it("is a no-op when no spinner active", () => {
    succeedSpinner("Nothing");
    expect(isSpinnerActive()).toBe(false);
  });
});

describe("failSpinner", () => {
  it("marks spinner as inactive", () => {
    startSpinner("Working...");
    failSpinner("Error!");
    expect(isSpinnerActive()).toBe(false);
  });

  it("is a no-op when no spinner active", () => {
    failSpinner("Nothing");
    expect(isSpinnerActive()).toBe(false);
  });
});

describe("stopSpinner", () => {
  it("stops spinner and marks as inactive", () => {
    startSpinner("Working...");
    stopSpinner();
    expect(isSpinnerActive()).toBe(false);
  });

  it("is a no-op when no spinner active", () => {
    expect(() => stopSpinner()).not.toThrow();
    expect(isSpinnerActive()).toBe(false);
  });
});

describe("pauseSpinner", () => {
  it("returns null when no spinner active", () => {
    expect(pauseSpinner()).toBeNull();
  });

  it("returns resume function and stops spinner temporarily", () => {
    startSpinner("Working...");
    const resume = pauseSpinner();
    expect(resume).toBeInstanceOf(Function);
    // Spinner is paused (stopped) but pauseSpinner doesn't null the ref —
    // the resume function re-starts the same spinner instance
    resume!();
    // After resume, spinner should still be tracked as active
    expect(isSpinnerActive()).toBe(true);
    stopSpinner();
  });
});

describe("lifecycle", () => {
  it("handles rapid start-stop cycles", () => {
    for (let i = 0; i < 10; i++) {
      startSpinner(`Cycle ${i}`);
      stopSpinner();
    }
    expect(isSpinnerActive()).toBe(false);
  });

  it("handles succeed after start", () => {
    startSpinner("Task");
    succeedSpinner("Completed");
    expect(isSpinnerActive()).toBe(false);
  });

  it("handles fail after start", () => {
    startSpinner("Task");
    failSpinner("Failed");
    expect(isSpinnerActive()).toBe(false);
  });
});
