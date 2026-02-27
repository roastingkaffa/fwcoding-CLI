/**
 * /farm list|allocate|release — Board farm management.
 */

import type { AppContext } from "../repl.js";
import { StubBoardFarmClient } from "../core/board-farm.js";
import * as log from "../utils/logger.js";

export async function handleFarm(args: string, ctx: AppContext): Promise<void> {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const subcommand = parts[0] ?? "list";
  const client = new StubBoardFarmClient();

  switch (subcommand) {
    case "list": {
      const boards = await client.listBoards();
      if (boards.length === 0) {
        log.info("No boards available.");
      } else {
        log.heading("Available Boards");
        for (const b of boards) {
          console.log(`  ${b.id.padEnd(16)} ${b.mcu.padEnd(16)} ${b.status}`);
        }
      }
      break;
    }

    case "allocate": {
      const boardId = parts[1];
      if (!boardId) {
        log.error("Usage: /farm allocate <board-id>");
        return;
      }
      try {
        const alloc = await client.allocate(boardId);
        log.success(`Allocated board ${alloc.board_id}`);
      } catch {
        log.error("Allocation failed. Board farm not configured.");
      }
      break;
    }

    case "release": {
      const boardId = parts[1];
      if (!boardId) {
        log.error("Usage: /farm release <board-id>");
        return;
      }
      await client.release(boardId);
      break;
    }

    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      log.info("Usage: /farm list|allocate|release");
  }
}
