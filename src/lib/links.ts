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
}): string {
  const username = input.username?.replace(/^@/, "");
  if (username) return `https://t.me/${username}/${input.messageId}`;
  const pathId = telegramPrivatePathId(input.chatId);
  return `https://t.me/c/${pathId}/${input.messageId}`;
}

/** Reply-thread deep link. The header message id is both the path and `?thread=`. */
export function buildThreadLink(input: {
  chatId: number;
  messageId: number;
  username?: string | null;
}): string {
  return `${buildMessageLink(input)}?thread=${input.messageId}`;
}
