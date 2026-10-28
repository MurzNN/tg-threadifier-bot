import { t } from "@lingui/core/macro";

import { escapeHtml } from "../../lib/html.js";
import { resolveTruncatedTitles } from "../../lib/truncate.js";

export type ResolvedTitles = {
  threadTitle: string;
  topicLabel: string;
  titleSource: "truncated";
};

/** No-AI titles: truncated root text, or the static media fallback. */
export function resolveRootTitles(
  text: string | null,
  caption: string | null,
): ResolvedTitles {
  const raw = (text ?? caption ?? "").trim();
  if (!raw) {
    const label = t`Media message`;
    return { threadTitle: label, topicLabel: label, titleSource: "truncated" };
  }
  const titles = resolveTruncatedTitles(raw);
  return {
    threadTitle: titles.threadTitle,
    topicLabel: titles.topicLabel,
    titleSource: "truncated",
  };
}

export function authorLabel(name: string | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : t`user`;
}

export function sourceChatLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : t`source chat`;
}

export function targetChatLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : t`target chat`;
}

export function renderThreadHeader(raw: {
  threadTitle: string;
  linkToUser: string;
  userDisplayName: string;
  linkToSourceChat: string;
  sourceChatName: string;
  threadLink: string;
}): string {
  const threadTitle = escapeHtml(raw.threadTitle);
  const linkToUser = escapeHtml(raw.linkToUser);
  const userDisplayName = escapeHtml(raw.userDisplayName);
  const linkToSourceChat = escapeHtml(raw.linkToSourceChat);
  const sourceChatName = escapeHtml(raw.sourceChatName);
  const threadLink = escapeHtml(raw.threadLink);
  return t`Thread: ${threadTitle}
Initiated by the user <a href="${linkToUser}">${userDisplayName}</a> in the chat <a href="${linkToSourceChat}">${sourceChatName}</a>.
<a href="${threadLink}">Thread link</a>.`;
}

export function renderSourceNotice(raw: {
  topicLabel: string;
  linkToUser: string;
  userDisplayName: string;
  linkToTargetChatThread: string;
  targetChatName: string;
}): string {
  const topicLabel = escapeHtml(raw.topicLabel);
  const linkToUser = escapeHtml(raw.linkToUser);
  const userDisplayName = escapeHtml(raw.userDisplayName);
  const linkToTargetChatThread = escapeHtml(raw.linkToTargetChatThread);
  const targetChatName = escapeHtml(raw.targetChatName);
  return t`The message "${topicLabel}" from <a href="${linkToUser}">${userDisplayName}</a> with responses forwarded to the chat <a href="${linkToTargetChatThread}">${targetChatName}</a>. Please continue the conversation there.`;
}

export function renderMatchFailure(): string {
  return t`Could not match these forwards to stored source messages, so nothing was deleted. The bot only relocates messages it has already seen.`;
}

export function renderRelocateAborted(phase: string): string {
  return t`Could not finish relocating this discussion (stopped at ${phase}). No further messages were deleted.`;
}

/** Attribution line appended to a copied message. `{authorName}` is the original sender. */
export function renderAuthorSuffix(authorName: string): string {
  return t`— ${authorName}`;
}
