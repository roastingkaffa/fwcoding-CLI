/**
 * Shell-quoting helpers for building command strings passed to /bin/sh.
 *
 * Any value that originates from model or user input and is interpolated into a
 * shell command MUST go through shellQuote — otherwise a single quote in the
 * value breaks out of the quoting and the rest is interpreted as shell syntax.
 */

/**
 * Wrap an arbitrary string as a single POSIX shell argument.
 *
 * Wraps the value in single quotes and escapes any embedded single quote using
 * the standard `'\''` sequence, so the result is always exactly one argument no
 * matter what characters it contains.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
