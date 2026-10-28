import type { Context } from "grammy";

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
