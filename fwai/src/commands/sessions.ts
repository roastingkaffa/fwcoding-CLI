import type { AppContext } from "../repl.js";
import { listSessions, deleteSession } from "../core/session-store.js";
import * as log from "../utils/logger.js";

export async function handleSessions(args: string, _ctx: AppContext): Promise<void> {
  const [subcommand, ...rest] = args.trim().split(/\s+/);

  if (subcommand === "delete" && rest[0]) {
    try {
      const removed = deleteSession(rest[0]);
      if (removed) {
        log.success(`Session ${rest[0]} deleted.`);
      } else {
        log.warn(`No session found with id: ${rest[0]}`);
      }
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // Default: list sessions
  const sessions = listSessions();
  if (sessions.length === 0) {
    log.info("No saved sessions. Use --resume to persist sessions.");
    return;
  }

  log.heading("Saved Sessions");
  for (const s of sessions.slice(0, 20)) {
    log.info(`  ${s.id}  (${s.messageCount} messages, updated ${s.updatedAt})`);
  }
  if (sessions.length > 20) {
    log.info(`  ... and ${sessions.length - 20} more`);
  }
}
