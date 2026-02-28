import fs from "node:fs";
import path from "node:path";
import type { Project } from "../schemas/project.schema.js";

export interface CycloneDXComponent {
  type: string;
  name: string;
  version: string;
  purl?: string;
  hashes?: Array<{ alg: string; content: string }>;
}

export interface CycloneDXBOM {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{ name: string; version: string }>;
  };
  components: CycloneDXComponent[];
}

/** Generate a CycloneDX 1.5 SBOM from project dependencies, package.json, and toolchain */
export function generateSBOM(project: Project, cwd: string): CycloneDXBOM {
  const components: CycloneDXComponent[] = [];

  // 1. npm dependencies from package.json
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name, version] of Object.entries(deps)) {
        components.push({
          type: "library",
          name,
          version: String(version).replace(/^[\^~>=<]/, ""),
          purl: `pkg:npm/${name}@${String(version).replace(/^[\^~>=<]/, "")}`,
        });
      }
    } catch {
      /* skip malformed package.json */
    }
  }

  // 2. Project dependencies from project.yaml
  if (project.project.dependencies) {
    for (const dep of project.project.dependencies) {
      components.push({
        type: dep.type === "rtos" ? "framework" : "library",
        name: dep.name,
        version: dep.version,
        purl: dep.source
          ? `pkg:generic/${dep.name}@${dep.version}?source=${encodeURIComponent(dep.source)}`
          : undefined,
      });
    }
  }

  // 3. Toolchain binaries from doctor-cache.json
  const cachePath = path.join(cwd, ".fwai", "logs", "doctor-cache.json");
  if (fs.existsSync(cachePath)) {
    try {
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      if (cache.versions) {
        for (const [name, version] of Object.entries(cache.versions)) {
          components.push({
            type: "application",
            name,
            version: String(version),
          });
        }
      }
    } catch {
      /* skip */
    }
  }

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ name: "fwai", version: "0.1.0" }],
    },
    components,
  };
}

/** Write SBOM to a JSON file */
export function writeSBOM(bom: CycloneDXBOM, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(bom, null, 2));
}

/** Generate SBOM for a run, write to run directory, return summary for evidence */
export function generateSBOMForRun(
  project: Project,
  runDir: string,
  cwd: string
): { format: "cyclonedx"; version: string; components_count: number; path: string } {
  const bom = generateSBOM(project, cwd);
  const sbomPath = path.join(runDir, "sbom.json");
  writeSBOM(bom, sbomPath);
  return {
    format: "cyclonedx",
    version: "1.5",
    components_count: bom.components.length,
    path: "sbom.json",
  };
}

/** Format a human-readable summary of the SBOM */
export function formatSBOMSummary(bom: CycloneDXBOM): string {
  const lines = [`SBOM: CycloneDX ${bom.specVersion} — ${bom.components.length} components`];
  const byType = new Map<string, number>();
  for (const c of bom.components) {
    byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  }
  for (const [type, count] of byType) {
    lines.push(`  ${type}: ${count}`);
  }
  return lines.join("\n");
}
