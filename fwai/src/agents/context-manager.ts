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

/** True if a message's content array leads with a tool_result block. */
function startsWithToolResult(msg: ToolMessage): boolean {
  if (typeof msg.content === "string") return false;
  return msg.content.length > 0 && msg.content[0].type === "tool_result";
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

  // Move the split boundary earlier if it would land on a user message that
  // begins with tool_result blocks — those must stay paired with the assistant
  // tool_use turn that precedes them, or the next API request 400s with an
  // orphaned tool_result. Widening `recent` keeps every pair intact.
  let splitIdx = messages.length - keepRecent;
  while (splitIdx > 0 && startsWithToolResult(messages[splitIdx])) {
    splitIdx--;
  }

  // If everything got pulled into `recent`, there's nothing to summarize.
  if (splitIdx <= 0) return messages;

  const older = messages.slice(0, splitIdx);
  const recent = messages.slice(splitIdx);

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
