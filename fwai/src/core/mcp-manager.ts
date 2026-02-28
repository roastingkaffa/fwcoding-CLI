/**
 * MCP Manager — manage multiple MCP server connections and auto-register tools.
 */

import type { MCPServerConfig } from "../schemas/mcp.schema.js";
import type { MCPConnection } from "./mcp-bridge.js";
import { wrapMCPTool } from "./mcp-bridge.js";
import { MCPStdioConnection } from "./mcp-stdio-connection.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import * as log from "../utils/logger.js";

export class MCPManager {
  private connections = new Map<string, MCPConnection>();

  /** Connect to all configured MCP servers */
  async connectAll(configs: MCPServerConfig[]): Promise<void> {
    for (const config of configs) {
      try {
        const conn = new MCPStdioConnection(config);
        await conn.connect();
        this.connections.set(config.name, conn);
        log.info(`MCP server "${config.name}" connected`);
      } catch (err) {
        log.warn(
          `MCP server "${config.name}" failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  /** Discover tools from all connected servers and register them */
  async discoverTools(registry: ToolRegistry): Promise<number> {
    let count = 0;
    for (const [name, conn] of this.connections) {
      if (!conn.isConnected()) continue;
      try {
        const tools = await conn.listTools();
        for (const tool of tools) {
          registry.register(wrapMCPTool(tool, conn, name));
          count++;
        }
        log.debug(`MCP "${name}": registered ${tools.length} tools`);
      } catch (err) {
        log.warn(
          `MCP "${name}" tool discovery failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return count;
  }

  /** Disconnect all servers */
  async disconnectAll(): Promise<void> {
    for (const [name, conn] of this.connections) {
      try {
        await conn.disconnect();
      } catch {
        log.debug(`MCP "${name}" disconnect error (ignored)`);
      }
    }
    this.connections.clear();
  }

  /** Get a specific connection */
  getConnection(name: string): MCPConnection | undefined {
    return this.connections.get(name);
  }

  /** Get all connected server names */
  getConnectedServers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.isConnected())
      .map(([name]) => name);
  }
}
