import { pauseSpinner } from "./ui.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type OutputMode = "normal" | "quiet" | "json";

let currentLevel: LogLevel = "info";
let colorEnabled = true;
let outputMode: OutputMode = "normal";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function c(color: keyof typeof COLORS, text: string): string {
  return colorEnabled ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

export function configureLogger(level: LogLevel, color: boolean): void {
  currentLevel = level;
  colorEnabled = color;
}

export function configureOutputMode(mode: OutputMode): void {
  outputMode = mode;
}

export function isQuiet(): boolean {
  return outputMode === "quiet" || outputMode === "json";
}

export function getOutputMode(): OutputMode {
  return outputMode;
}

/** Pause spinner, log, resume spinner */
function withSpinnerPause(fn: () => void): void {
  const resume = pauseSpinner();
  fn();
  resume?.();
}

/** Raw content output (LLM analysis, budget display). Suppressed when quiet/json. */
export function output(msg: string): void {
  if (isQuiet()) return;
  withSpinnerPause(() => console.log(msg));
}

export function debug(msg: string): void {
  if (isQuiet()) return;
  if (shouldLog("debug")) withSpinnerPause(() => console.log(c("gray", `[debug] ${msg}`)));
}

export function info(msg: string): void {
  if (isQuiet()) return;
  if (shouldLog("info")) withSpinnerPause(() => console.log(c("cyan", "ℹ") + ` ${msg}`));
}

export function success(msg: string): void {
  if (isQuiet()) return;
  if (shouldLog("info")) withSpinnerPause(() => console.log(c("green", "✓") + ` ${msg}`));
}

export function warn(msg: string): void {
  if (isQuiet()) return;
  if (shouldLog("warn")) withSpinnerPause(() => console.log(c("yellow", "⚠") + ` ${msg}`));
}

export function error(msg: string): void {
  if (shouldLog("error")) withSpinnerPause(() => console.error(c("red", "✗") + ` ${msg}`));
}

export function heading(msg: string): void {
  if (isQuiet()) return;
  withSpinnerPause(() => console.log(c("bold", msg)));
}

export function line(char = "━", len = 56): void {
  if (isQuiet()) return;
  withSpinnerPause(() => console.log(char.repeat(len)));
}
