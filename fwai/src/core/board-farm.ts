/**
 * Board Farm client interface and stub implementation.
 *
 * The interface defines the contract for board farm integration.
 * StubBoardFarmClient logs warnings — replaced by real client when integrated.
 */

import type { Board, BoardAllocation } from "../schemas/board-farm.schema.js";
import * as log from "../utils/logger.js";

export interface BoardFarmClient {
  listBoards(): Promise<Board[]>;
  allocate(boardId: string, runId?: string): Promise<BoardAllocation>;
  release(boardId: string): Promise<void>;
  getStatus(boardId: string): Promise<Board | null>;
}

export class StubBoardFarmClient implements BoardFarmClient {
  async listBoards(): Promise<Board[]> {
    log.warn("Board farm not configured. This is a stub implementation.");
    log.info("Configure board_farm in .fwai/config.yaml to connect to a real farm.");
    return [];
  }

  async allocate(boardId: string): Promise<BoardAllocation> {
    log.warn(`Board farm stub: cannot allocate board "${boardId}".`);
    throw new Error("Board farm not configured");
  }

  async release(boardId: string): Promise<void> {
    log.warn(`Board farm stub: cannot release board "${boardId}".`);
  }

  async getStatus(boardId: string): Promise<Board | null> {
    log.warn(`Board farm stub: cannot get status for "${boardId}".`);
    return null;
  }
}
