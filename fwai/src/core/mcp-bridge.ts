/**
 * MCP (Model Context Protocol) bridge.
 *
 * Defines the interface for connecting to MCP servers and wrapping
 * their tools as AgenticTools. StubMCPConnection is a placeholder
 * until a real MCP client library is integrated.
 */

import type {
  AgenticTool,
  ToolExecutionContext,
  ToolExecutionResult,
} from "../tools/tool-interface.js";
import type { LLMToolDefinition } from "../providers/tool-types.js";
import type { MCPServerConfig } from "../schemas/mcp.schema.js";
import * as log from "../utils/logger.js";
import { FwaiError } from "../utils/errors.js";

// ── Interfaces ────────────────────────────────────────────────────────

export interface MCPToolInfo {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface MCPConnection {
  /** Connect to the MCP server process */
  connect(): Promise<void>;
  /** Disconnect from the MCP server */
  disconnect(): Promise<void>;
  /** List available tools from the server */
  listTools(): Promise<MCPToolInfo[]>;
  /** Call a tool on the server */
  callTool(name: string, input: Record<string, unknown>): Promise<string>;
  /** Check if connected */
  isConnected(): boolean;
}

// ── Wrapper: MCP tool → AgenticTool ──────────────────────────────────

/**
 * Wrap an MCP server tool as an AgenticTool that can be registered
 * in the ToolRegistry and used by the agentic loop.
 */
export function wrapMCPTool(
  toolInfo: MCPToolInfo,
  connection: MCPConnection,
  serverName: string
): AgenticTool {
  const definition: LLMToolDefinition = {
    name: `mcp_${serverName}_${toolInfo.name}`,
    description: `[MCP:${serverName}] ${toolInfo.description}`,
    input_schema: toolInfo.input_schema,
  };

  return {
    definition,
    async execute(
      input: Record<string, unknown>,
      _context: ToolExecutionContext
    ): Promise<ToolExecutionResult> {
      if (!connection.isConnected()) {
        return {
          content: `Error: MCP server "${serverName}" is not connected`,
          is_error: true,
        };
      }

      try {
        const result = await connection.callTool(toolInfo.name, input);
        return { content: result, is_error: false };
      } catch (err) {
        return {
          content: `MCP tool error: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        };
      }
    },
  };
}

// ── Stub Implementation ──────────────────────────────────────────────

export class StubMCPConnection implements MCPConnection {
  private config: MCPServerConfig;
  private connected = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    log.warn(
      `MCP stub: Would connect to "${this.config.name}" via: ${this.config.command} ${this.config.args.join(" ")}`
    );
    log.info("MCP server integration is a stub. Install an MCP client library to enable.");
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    log.debug(`MCP stub: Disconnected from "${this.config.name}"`);
    this.connected = false;
  }

  async listTools(): Promise<MCPToolInfo[]> {
    log.warn(`MCP stub: No tools available from "${this.config.name}"`);
    return [];
  }

  async callTool(name: string, _input: Record<string, unknown>): Promise<string> {
    throw new FwaiError(
      `MCP stub: Cannot call tool "${name}" on "${this.config.name}". Server not implemented.`,
      "MCP_STUB"
    );
  }

  isConnected(): boolean {
    return this.connected;
  }
}
