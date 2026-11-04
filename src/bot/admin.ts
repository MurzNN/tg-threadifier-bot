import type { Api, Context } from "grammy";

import { BATCH_WINDOW_MS } from "./relocate/batcher.js";

type MemberApi = Pick<Api, "getChatMember">;

const deletePermissionCache = new Map<
  string,
  { expiresAt: number; allowed: boolean }
>();

/** Drop cached delete-messages lookups. Tests use this between cases. */
export function clearCanDeleteMessagesCache(): void {
  deletePermissionCache.clear();
}

function memberCanDeleteMessages(member: {
  status: string;
  can_delete_messages?: boolean;
}): boolean {
  if (member.status === "creator") return true;
  return member.status === "administrator" && member.can_delete_messages === true;
}

/**
 * True when this user can delete other people's messages in `chatId`.
 * The owner can. An administrator can only when `can_delete_messages` is set.
 * A failed lookup is a denial. Results are cached for the forward batch window
 * unless `fresh` is set (confirm and discard re-check).
 */
export async function canDeleteMessages(
  api: MemberApi,
  chatId: number,
  userId: number,
  options?: { fresh?: boolean },
): Promise<boolean> {
  const key = `${chatId}:${userId}`;
  const now = Date.now();
  if (!options?.fresh) {
    const hit = deletePermissionCache.get(key);
    if (hit && hit.expiresAt > now) return hit.allowed;
  }
  let allowed: boolean;
  try {
    const member = await api.getChatMember(chatId, userId);
    allowed = memberCanDeleteMessages(member);
  } catch {
    allowed = false;
  }
  deletePermissionCache.set(key, { expiresAt: now + BATCH_WINDOW_MS, allowed });
  return allowed;
}

export async function requireChatAdmin(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId || !ctx.chat) return false;
  if (ctx.chat.type === "private") return true;
  try {
    const member = await ctx.getChatMember(userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

export function chatTitle(ctx: Context): string | null {
  const chat = ctx.chat;
  if (!chat) return null;
  if ("title" in chat && chat.title) return chat.title;
  if ("first_name" in chat) {
    return [chat.first_name, "last_name" in chat ? chat.last_name : undefined]
      .filter(Boolean)
      .join(" ");
  }
  return null;
}

export function chatUsernameOrPath(ctx: Context): string | null {
  const chat = ctx.chat;
  if (!chat) return null;
  if ("username" in chat && chat.username) return chat.username;
  return null;
}
