/** Private supergroup/channel id used in `t.me/c/…` (strip the `-100` prefix). */
export function telegramPrivatePathId(chatId: number): string {
  const raw = String(chatId);
  if (raw.startsWith("-100")) return raw.slice(4);
  return raw.replace(/^-/, "");
}

export function buildUserLink(userId: number): string {
  return `tg://user?id=${userId}`;
}

export function buildMessageLink(input: {
  chatId: number;
  messageId: number;
  username?: string | null;
  /** Forum topic. When set, the link opens that topic. */
  topicId?: number | null;
}): string {
  const username = input.username?.replace(/^@/, "");
  const topic = input.topicId != null ? `${input.topicId}/` : "";
  if (username) return `https://t.me/${username}/${topic}${input.messageId}`;
  const pathId = telegramPrivatePathId(input.chatId);
  return `https://t.me/c/${pathId}/${topic}${input.messageId}`;
}

/**
 * Reply-thread deep link. Outside a forum, the header id is both the path and
 * `?thread=`. Inside a forum, `?thread=` is the topic, so the link is the
 * message path (with the topic segment when the message is not in General).
 */
export function buildThreadLink(input: {
  chatId: number;
  messageId: number;
  username?: string | null;
  topicId?: number | null;
  /** Forum pair, including a header in the General topic. */
  forum?: boolean;
}): string {
  if (input.topicId != null || input.forum) return buildMessageLink(input);
  return `${buildMessageLink(input)}?thread=${input.messageId}`;
}
