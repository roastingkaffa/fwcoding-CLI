import { spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import * as log from "../utils/logger.js";

export interface OpenOCDHandle {
  process: ChildProcess;
  gdbPort: number;
  telnetPort: number;
  stop: () => void;
}

/** Start an OpenOCD server and wait for it to be ready */
export async function startOpenOCD(
  config: string,
  cwd?: string
): Promise<OpenOCDHandle> {
  return new Promise((resolve, reject) => {
    const proc = spawn("openocd", ["-f", config], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let gdbPort = 3333;
    let telnetPort = 4444;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // OpenOCD may still be starting; resolve with defaults
        log.warn("OpenOCD startup timeout — proceeding with default ports.");
        resolve({
          process: proc,
          gdbPort,
          telnetPort,
          stop: () => { proc.kill("SIGTERM"); },
        });
      }
    }, 10000);

    if (proc.stderr) {
      const rl = readline.createInterface({ input: proc.stderr });

      rl.on("line", (line) => {
        log.debug(`[openocd] ${line}`);

        // Parse actual port from output
        const gdbMatch = line.match(/Listening on port (\d+) for gdb/);
        if (gdbMatch) gdbPort = parseInt(gdbMatch[1], 10);

        const telnetMatch = line.match(/Listening on port (\d+) for telnet/);
        if (telnetMatch) telnetPort = parseInt(telnetMatch[1], 10);

        // Ready indicator
        if (line.includes("Listening on port") && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            process: proc,
            gdbPort,
            telnetPort,
            stop: () => { proc.kill("SIGTERM"); },
          });
        }
      });
    }

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`OpenOCD failed to start: ${err.message}`));
      }
    });

    proc.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`OpenOCD exited with code ${code} before ready`));
      }
    });
  });
}
