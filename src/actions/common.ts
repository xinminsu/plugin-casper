import { HandlerCallback } from '@elizaos/core';
import { safeJsonStringify, toSerializable } from '../utils';

/**
 * Shared helpers for the category-aggregated Casper actions. Keeps each action
 * file short and consistent around callback formatting / error handling.
 */

/** Send a plain-text success response with optional structured `content`. */
export function replyOk(callback: HandlerCallback, text: string, content?: Record<string, unknown>): void {
  callback({
    text,
    ...(content ? { content } : {}),
  });
}

/** Send an error response. */
export function replyError(callback: HandlerCallback, context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  callback({
    text: `❌ ${context}: ${message}`,
    content: { error: message },
  });
}

/** Pretty JSON serializer for RPC results in a text reply. */
export function pretty(value: unknown, indent = 2): string {
  return safeJsonStringify(toSerializable(value), indent);
}

/**
 * Standard success summary for a write deploy, mirroring the skill's
 * `createDeploySuccessEmbed` but as plain text.
 */
export function formatDeployResult(
  title: string,
  deployHash: string,
  result: any,
  extraLines: string[] = []
): { text: string; content: Record<string, unknown> } {
  const exec = result?.execution_results?.[0]?.result;
  const success = !!(exec && exec.Success);
  const cost = exec?.Success?.cost ?? exec?.Failure?.cost ?? '0';
  const errMsg = exec?.Failure?.error_message;

  const lines = [
    `✅ ${title}`,
    `Deploy Hash: ${deployHash}`,
    `Status: ${success ? '✅ Success' : '❌ Failed'}`,
    `Gas Consumed: ${cost} motes`,
    ...extraLines,
  ];
  if (errMsg) lines.push(`Error: ${errMsg}`);

  return {
    text: lines.join('\n'),
    content: { deployHash, success, cost, title },
  };
}
