/**
 * MCP stdio connection — real JSON-RPC 2.0 over stdio transport.
 * Spawns an MCP server as a child process, communicates via stdin/stdout.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { MCPConnection, MCPToolInfo } from "./mcp-bridge.js";
import type { MCPServerConfig } from "../schemas/mcp.schema.js";
import * as log from "../utils/logger.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class MCPStdioConnection implements MCPConnection {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private connected = false;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
    }
  >();
  private buffer = "";

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const { command, args, env, timeout_sec } = this.config;

    this.process = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });

    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      log.debug(`MCP [${this.config.name}] stderr: ${chunk.toString().trim()}`);
    });

    this.process.on("exit", (code) => {
      log.debug(`MCP [${this.config.name}] exited with code ${code}`);
      this.connected = false;
      // Reject all pending requests
      for (const [, handler] of this.pending) {
        handler.reject(new Error(`MCP server exited with code ${code}`));
      }
      this.pending.clear();
    });

    // Send initialize request
    const timeout = (timeout_sec ?? 30) * 1000;
    try {
      await this.sendRequest(
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "fwai", version: "0.1.0" },
        },
        timeout
      );
      this.connected = true;
      log.debug(`MCP [${this.config.name}] connected`);
    } catch (err) {
      this.kill();
      throw new Error(
        `MCP [${this.config.name}] init failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async disconnect(): Promise<void> {
    this.kill();
    this.connected = false;
  }

  async listTools(): Promise<MCPToolInfo[]> {
    const result = (await this.sendRequest("tools/list", {})) as {
      tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[];
    };
    return (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema ?? { type: "object", properties: {} },
    }));
  }

  async callTool(name: string, input: Record<string, unknown>): Promise<string> {
    const result = (await this.sendRequest("tools/call", { name, arguments: input })) as {
      content?: { type: string; text?: string }[];
    };
    const textParts = (result.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!);
    return textParts.join("\n") || JSON.stringify(result);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeout?: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        return reject(new Error("MCP process not available"));
      }

      const id = this.nextId++;
      const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

      this.pending.set(id, { resolve, reject });

      const timeoutMs = timeout ?? 30000;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.process.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const handler = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            handler.resolve(msg.result);
          }
        }
      } catch {
        log.debug(`MCP [${this.config.name}] unparseable: ${trimmed.slice(0, 100)}`);
      }
    }
  }

  private kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
