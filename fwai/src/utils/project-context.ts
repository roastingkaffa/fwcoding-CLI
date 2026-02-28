import type { Project } from "../schemas/project.schema.js";

export interface ProjectContext {
  name: string;
  mcu: string;
  arch?: string;
  board?: string;
  flash_size?: string;
  ram_size?: string;
  compiler: string;
  compiler_version?: string;
  build_system: string;
  debugger?: string;
}

/** Extract ProjectContext from project.yaml data */
export function buildProjectContext(project: Project, compilerVersion?: string): ProjectContext {
  const p = project.project;
  return {
    name: p.name,
    mcu: p.target.mcu,
    arch: p.target.arch,
    board: p.target.board,
    flash_size: p.target.flash_size,
    ram_size: p.target.ram_size,
    compiler: p.toolchain.compiler,
    compiler_version: compilerVersion,
    build_system: p.build.system,
    debugger: p.toolchain.debugger,
  };
}

/** Format ProjectContext as a system prompt block */
export function formatContextBlock(ctx: ProjectContext): string {
  const lines = [
    "## Firmware Project Context (auto-injected)",
    `- Project: ${ctx.name}`,
    `- MCU: ${ctx.mcu}`,
  ];
  if (ctx.arch) lines.push(`- Architecture: ${ctx.arch}`);
  if (ctx.board) lines.push(`- Board: ${ctx.board}`);
  if (ctx.flash_size || ctx.ram_size) {
    lines.push(`- Flash: ${ctx.flash_size ?? "unknown"} | RAM: ${ctx.ram_size ?? "unknown"}`);
  }
  lines.push(`- Build System: ${ctx.build_system}`);
  // If version string already contains the compiler name, use it directly
  const compiler = ctx.compiler_version
    ? ctx.compiler_version.startsWith(ctx.compiler)
      ? ctx.compiler_version
      : `${ctx.compiler} ${ctx.compiler_version}`
    : ctx.compiler;
  lines.push(`- Compiler: ${compiler}`);
  if (ctx.debugger) lines.push(`- Debugger: ${ctx.debugger}`);
  return lines.join("\n");
}
