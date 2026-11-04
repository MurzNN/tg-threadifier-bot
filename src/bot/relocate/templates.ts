import { plural, t } from "@lingui/core/macro";

import { escapeHtml } from "../../lib/html.js";
import { resolveTruncatedTitles, truncateText } from "../../lib/truncate.js";

export type ResolvedTitles = {
  threadTitle: string;
  titleSource: "truncated" | "custom";
};

/** Preview lines shown on a relocate confirmation before the rest are counted. */
export const PREVIEW_LINE_COUNT = 8;

const PREVIEW_LINE_MAX = 80;

/** No-AI titles: truncated root text, or the static media fallback. */
export function resolveRootTitles(
  text: string | null,
  caption: string | null,
): ResolvedTitles {
  const raw = (text ?? caption ?? "").trim();
  if (!raw) {
    const label = t`Media message`;
    return { threadTitle: label, titleSource: "truncated" };
  }
  const titles = resolveTruncatedTitles(raw);
  return {
    threadTitle: titles.threadTitle,
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

/** Header posted in the destination forum topic. The link points at the source topic. */
export function renderForumThreadHeader(raw: {
  threadTitle: string;
  linkToUser: string;
  userDisplayName: string;
  linkToSourceChat: string;
  threadLink: string;
}): string {
  const threadTitle = escapeHtml(raw.threadTitle);
  const linkToUser = escapeHtml(raw.linkToUser);
  const userDisplayName = escapeHtml(raw.userDisplayName);
  const linkToSourceChat = escapeHtml(raw.linkToSourceChat);
  const threadLink = escapeHtml(raw.threadLink);
  return t({
    comment:
      "Thread header in a forum topic. The link is another topic in the same group, not a different chat. Thread means a reply thread, not a forum topic.",
    message: `Thread: ${threadTitle}
Initiated by the user <a href="${linkToUser}">${userDisplayName}</a> in <a href="${linkToSourceChat}">another topic</a>.
<a href="${threadLink}">Thread link</a>.`,
  });
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

/** Redirect notice posted in the source forum topic. */
export function renderForumSourceNotice(raw: {
  threadTitle: string;
  linkToUser: string;
  userDisplayName: string;
  linkToTargetChatThread: string;
}): string {
  const threadTitle = escapeHtml(raw.threadTitle);
  const linkToUser = escapeHtml(raw.linkToUser);
  const userDisplayName = escapeHtml(raw.userDisplayName);
  const linkToTargetChatThread = escapeHtml(raw.linkToTargetChatThread);
  return t({
    comment:
      "Notice in the source forum topic. The link opens the new reply thread in another topic of the same group. Thread means a reply thread, not a forum topic.",
    message: `The message "${threadTitle}" from <a href="${linkToUser}">${userDisplayName}</a> with responses moved to <a href="${linkToTargetChatThread}">a thread in another topic</a>. Please continue the conversation there.`,
  });
}

export function renderSourceNotice(raw: {
  threadTitle: string;
  linkToUser: string;
  userDisplayName: string;
  linkToTargetChatThread: string;
  targetChatName: string;
}): string {
  const threadTitle = escapeHtml(raw.threadTitle);
  const linkToUser = escapeHtml(raw.linkToUser);
  const userDisplayName = escapeHtml(raw.userDisplayName);
  const linkToTargetChatThread = escapeHtml(raw.linkToTargetChatThread);
  const targetChatName = escapeHtml(raw.targetChatName);
  return t`The message "${threadTitle}" from <a href="${linkToUser}">${userDisplayName}</a> with responses forwarded to the chat <a href="${linkToTargetChatThread}">${targetChatName}</a>. Please continue the conversation there.`;
}

export function renderPermissionDenied(): string {
  return t({
    comment:
      "Sent in the target chat when the person who forwarded no longer has permission to delete messages in the source chat. Nothing is deleted.",
    message: `You need permission to delete messages in the source chat to relocate these forwards. Nothing was deleted.`,
  });
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

export function renderPreviewLine(author: string, body: string): string {
  const safeAuthor = escapeHtml(author);
  const safeBody = escapeHtml(truncateText(body, PREVIEW_LINE_MAX));
  return `${safeAuthor}: ${safeBody}`;
}

function bundleSummary(input: {
  count: number;
  threadTitle: string;
  lines: string[];
  hiddenCount: number;
}): string {
  const countLine = plural(input.count, {
    one: "Relocate # message into a thread?",
    other: "Relocate # messages into a thread?",
  });
  const threadTitle = escapeHtml(input.threadTitle);
  const titleLine = t({
    comment:
      "Relocate confirmation. {threadTitle} is the title the new thread would use. Already escaped for Telegram HTML.",
    message: `Thread: ${threadTitle}`,
  });
  const preview = input.lines.join("\n");
  const more =
    input.hiddenCount > 0
      ? `\n${plural(input.hiddenCount, {
          one: "And # more message.",
          other: "And # more messages.",
        })}`
      : "";
  return `${countLine}\n\n${titleLine}\n\n${preview}${more}`;
}

export function renderConfirmPrompt(input: {
  count: number;
  threadTitle: string;
  lines: string[];
  hiddenCount: number;
}): string {
  return bundleSummary(input);
}

export function renderTitlePrompt(input: {
  count: number;
  threadTitle: string;
  lines: string[];
  hiddenCount: number;
}): string {
  const ask = t({
    comment:
      "Prompt in the helper chat. The moderator's next plain message becomes the thread title and is stored in full, without the 120-character limit.",
    message: "Send the thread title. It will be used as entered.",
  });
  return `${ask}\n\n${bundleSummary(input)}`;
}

export function renderPickPrompt(input: {
  count: number;
  threadTitle: string;
  lines: string[];
  hiddenCount: number;
}): string {
  const choose = t({
    comment:
      "Prompt in the helper chat. The moderator picks one of the recent threads listed on the buttons below.",
    message: "Choose a thread for these messages.",
  });
  return `${choose}\n\n${bundleSummary(input)}`;
}

export function buttonCreateThread(): string {
  return t({
    comment:
      "Inline button in the helper chat. Creates a new reply thread from the forwarded messages in this confirmation.",
    message: "Create new thread",
  });
}

export function buttonCustomTitle(): string {
  return t({
    comment:
      "Inline button in the helper chat. Asks the moderator to type a thread title instead of the automatic one.",
    message: "Set custom thread title",
  });
}

export function buttonAttachThread(): string {
  return t({
    comment:
      "Inline button in the helper chat. Opens a list of recent threads so the forwarded messages can be added to one of them.",
    message: "Attach to a previous thread",
  });
}

export function buttonDeleteMessages(): string {
  return t({
    comment:
      "Inline button in the helper chat. Deletes the forwarded messages grouped by this confirmation and cancels creating or attaching a thread. Does not delete the originals in the main chat.",
    message: "Delete these messages",
  });
}

export function buttonRecentThread(threadTitle12: string): string {
  return t({
    comment:
      "Inline button that adds the forwarded messages to an existing thread. {threadTitle12} is that thread's title shortened to 12 characters.",
    message: `Thread: ${threadTitle12}`,
  });
}

export function renderOnlyForwarder(): string {
  return t({
    comment:
      "Callback answer when someone other than the moderator who forwarded the messages presses a relocate button.",
    message: "Only the person who forwarded these messages can choose.",
  });
}

export function renderConfirmExpired(): string {
  return t({
    comment:
      "Callback answer when the relocate confirmation is no longer in memory, for example after a bot restart.",
    message: "This confirmation has expired.",
  });
}

export function renderNoRecentThreads(): string {
  return t({
    comment:
      "Callback alert when the moderator wants to attach forwards but this helper chat has no threads yet.",
    message: "No previous threads in this chat yet.",
  });
}

export function renderThreadUnavailable(): string {
  return t({
    comment:
      "Callback answer when the chosen thread no longer exists in this helper chat.",
    message: "That thread is no longer available.",
  });
}

export function renderDiscardFailed(): string {
  return t({
    comment:
      "Sent in the helper chat when deleting the forwarded messages of a cancelled relocate fails. The confirmation stays open.",
    message: "Could not delete these messages. The confirmation is still open.",
  });
}
