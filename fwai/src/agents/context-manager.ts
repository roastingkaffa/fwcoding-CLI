/**
 * Context window management — prevents token overflow in long conversations.
 *
 * Estimates token counts, detects when compression is needed, and
 * summarizes older messages to stay within budget.
 */

import type { LLMProvider } from "../providers/provider.js";
import type { ToolMessage, ContentBlock } from "../providers/tool-types.js";
import { extractText } from "../providers/tool-types.js";

/** Rough token estimation: ~4 characters per token */
export function estimateTokenCount(messages: ToolMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else {
      for (const block of msg.content) {
        if (block.type === "text") {
          chars += block.text.length;
        } else if (block.type === "tool_use") {
          chars += JSON.stringify(block.input).length + block.name.length;
        } else if (block.type === "tool_result") {
          chars += block.content.length;
        }
      }
    }
  }
  return Math.ceil(chars / 4);
}

/** Check if conversation should be compressed */
export function shouldCompress(messages: ToolMessage[], maxTokens: number): boolean {
  const estimated = estimateTokenCount(messages);
  return estimated > maxTokens * 0.8;
}

/**
 * Compress conversation by summarizing older messages.
 * Keeps the most recent `keepRecent` messages intact and
 * replaces older messages with a summary.
 */
export async function compressConversation(
  messages: ToolMessage[],
  provider: LLMProvider,
  opts?: { keepRecent?: number; maxContextTokens?: number }
): Promise<ToolMessage[]> {
  const keepRecent = opts?.keepRecent ?? 6;

  if (messages.length <= keepRecent) return messages;

  const older = messages.slice(0, messages.length - keepRecent);
  const recent = messages.slice(messages.length - keepRecent);

  // Build a text representation of older messages for summarization
  const olderText = older
    .map((m) => {
      const text =
        typeof m.content === "string" ? m.content : extractText(m.content as ContentBlock[]);
      return `[${m.role}]: ${text.slice(0, 500)}`;
    })
    .join("\n");

  try {
    const summary = await provider.complete({
      messages: [
        {
          role: "user",
          content: `Summarize this conversation history in 2-3 concise paragraphs. Focus on key decisions, findings, and context:\n\n${olderText}`,
        },
      ],
      system: "You are a conversation summarizer. Be concise and preserve technical details.",
      max_tokens: 500,
    });

    const summaryMessage: ToolMessage = {
      role: "user",
      content: `[Conversation summary]: ${summary.content}`,
    };

    return [summaryMessage, ...recent];
  } catch {
    // If summarization fails, just keep recent messages
    return recent;
  }
}
