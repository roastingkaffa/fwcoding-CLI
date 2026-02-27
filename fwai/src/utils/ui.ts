import ora, { type Ora } from "ora";

let activeSpinner: Ora | null = null;

/** Start a spinner with the given message. Stops any active spinner first. */
export function startSpinner(text: string): void {
  if (activeSpinner) {
    activeSpinner.stop();
  }
  activeSpinner = ora({
    text,
    stream: process.stderr,
    // Auto-disable on non-TTY (CI environments)
    isEnabled: process.stderr.isTTY === true,
  }).start();
}

/** Update the text of the active spinner */
export function updateSpinner(text: string): void {
  if (activeSpinner) {
    activeSpinner.text = text;
  }
}

/** Mark the spinner as succeeded */
export function succeedSpinner(text?: string): void {
  if (activeSpinner) {
    activeSpinner.succeed(text);
    activeSpinner = null;
  }
}

/** Mark the spinner as failed */
export function failSpinner(text?: string): void {
  if (activeSpinner) {
    activeSpinner.fail(text);
    activeSpinner = null;
  }
}

/** Stop the spinner without a status symbol */
export function stopSpinner(): void {
  if (activeSpinner) {
    activeSpinner.stop();
    activeSpinner = null;
  }
}

/** Check if a spinner is currently active */
export function isSpinnerActive(): boolean {
  return activeSpinner !== null;
}

/** Temporarily pause the spinner (e.g., while logging). Returns resume function. */
export function pauseSpinner(): (() => void) | null {
  if (!activeSpinner) return null;
  const spinner = activeSpinner;
  spinner.stop();
  return () => {
    spinner.start();
  };
}
