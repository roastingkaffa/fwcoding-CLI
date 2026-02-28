/**
 * Interpolate ${variable} patterns in a string.
 *
 * Supports nested keys like ${project.serial.port}.
 * Unresolved variables are left as-is.
 */
export function interpolate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, key: string) => {
    const value = resolveKey(key, variables);
    return value !== undefined ? String(value) : `\${${key}}`;
  });
}

function resolveKey(key: string, obj: Record<string, unknown>): unknown | undefined {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
