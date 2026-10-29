import { t } from "@lingui/core/macro";
import type { Bot, Context } from "grammy";

import {
  deletePairsForChat,
  findEnabledPairForChat,
  listChatPairsForUser,
  listEnabledPairs,
  listEnabledPairsForUser,
  listPairsForChat,
  PairDraftStore,
  PairOwnedByAnotherUserError,
  upsertChatPair,
  type ChatPair,
  type PairDraft,
} from "../../db/chatPairs.js";
import type { AppDb } from "../../db/client.js";
import {
  chatTitle,
  chatUsernameOrPath,
  requireChatAdmin,
} from "../admin.js";

async function completeIfReady(
  ctx: Context,
  db: AppDb,
  drafts: PairDraftStore,
  operatorId: number,
  draft: PairDraft,
): Promise<boolean> {
  if (draft.sourceChatId == null || draft.targetChatId == null) {
    return false;
  }
  if (draft.sourceChatId === draft.targetChatId) {
    await ctx.reply(
      t`Source and target must be different chats. Use /pair again in each chat.`,
    );
    drafts.clear(operatorId);
    return true;
  }

  let pair: ChatPair;
  try {
    pair = await upsertChatPair(db, {
      sourceChatId: draft.sourceChatId,
      targetChatId: draft.targetChatId,
      configuredByUserId: operatorId,
      sourceTitle: draft.sourceTitle,
      targetTitle: draft.targetTitle,
      sourceUsernameOrPath: draft.sourceUsernameOrPath,
      enabled: true,
    });
  } catch (error) {
    if (error instanceof PairOwnedByAnotherUserError) {
      drafts.clear(operatorId);
      await ctx.reply(
        t`This source and target are already paired by another user.`,
      );
      return true;
    }
    throw error;
  }
  drafts.clear(operatorId);
  await ctx.reply(
    t`Pair enabled: source ${pair.sourceChatId} → target ${pair.targetChatId}. Ingest is active for both chats.`,
  );
  return true;
}

function chatLabel(title: string | null, chatId: number): string {
  const name = title?.replace(/\s+/g, " ").trim();
  return name ? `${name} (${chatId})` : String(chatId);
}

function formatConfiguredPair(pair: ChatPair): string {
  const source = chatLabel(pair.sourceTitle, pair.sourceChatId);
  const target = chatLabel(pair.targetTitle, pair.targetChatId);
  if (pair.enabled) {
    return t`#${pair.id} (enabled): ${source} → ${target}`;
  }
  return t`#${pair.id} (disabled): ${source} → ${target}`;
}

function formatChatPairStatus(pair: ChatPair, chatId: number): string {
  const source = chatLabel(pair.sourceTitle, pair.sourceChatId);
  const target = chatLabel(pair.targetTitle, pair.targetChatId);
  if (pair.sourceChatId === chatId) {
    if (pair.enabled) {
      return t`This chat is the source in pair #${pair.id} (enabled).\nSource: ${source}\nTarget: ${target}`;
    }
    return t`This chat is the source in pair #${pair.id} (disabled).\nSource: ${source}\nTarget: ${target}`;
  }
  if (pair.enabled) {
    return t`This chat is the target in pair #${pair.id} (enabled).\nSource: ${source}\nTarget: ${target}`;
  }
  return t`This chat is the target in pair #${pair.id} (disabled).\nSource: ${source}\nTarget: ${target}`;
}

/** `/pair` with no arguments: every pair in private, this chat's pairing in a group. */
async function replyPairStatus(ctx: Context, db: AppDb): Promise<void> {
  if (!ctx.chat || !ctx.from) return;

  if (ctx.chat.type === "private") {
    const pairs = await listChatPairsForUser(db, ctx.from.id);
    if (pairs.length === 0) {
      await ctx.reply(
        t`No chat pairs configured. Run /pair source and /pair target inside the group chats to link.`,
      );
      return;
    }
    const lines = pairs.map(formatConfiguredPair);
    await ctx.reply(t`Configured pairs:\n${lines.join("\n")}`);
    return;
  }

  const chatId = ctx.chat.id;
  const pairs = await listPairsForChat(db, chatId);
  if (pairs.length === 0) {
    await ctx.reply(
      t`This chat is not paired. Admins can run /pair source or /pair target here.`,
    );
    return;
  }
  if (pairs.length === 1) {
    await ctx.reply(formatChatPairStatus(pairs[0]!, chatId));
    return;
  }
  const blocks = pairs.map((pair) => formatChatPairStatus(pair, chatId));
  await ctx.reply(
    t`This chat is in ${pairs.length} pairs:\n${blocks.join("\n\n")}`,
  );
}

export function registerPairCommands(
  bot: Bot,
  db: AppDb,
  drafts: PairDraftStore,
): void {
  bot.command("pair", async (ctx) => {
    if (!ctx.chat || !ctx.from) return;

    const role = (ctx.match ?? "").trim().toLowerCase();
    if (role === "") {
      await replyPairStatus(ctx, db);
      return;
    }
    if (role !== "source" && role !== "target") {
      await ctx.reply(
        t`Usage: /pair source or /pair target (run inside the group). /pair alone shows pairing status.`,
      );
      return;
    }
    if (!(await requireChatAdmin(ctx))) {
      await ctx.reply(t`Only chat admins can configure pairs.`);
      return;
    }
    if (ctx.chat.type === "private") {
      await ctx.reply(
        t`Run /pair source or /pair target inside the group chats to link.`,
      );
      return;
    }

    const operatorId = ctx.from.id;
    const draft = { ...drafts.get(operatorId) };
    const title = chatTitle(ctx);
    const path = chatUsernameOrPath(ctx);

    if (role === "source") {
      draft.sourceChatId = ctx.chat.id;
      draft.sourceTitle = title;
      draft.sourceUsernameOrPath = path;
      drafts.set(operatorId, draft);
      if (await completeIfReady(ctx, db, drafts, operatorId, draft)) return;
      await ctx.reply(
        t`Source chat recorded (${ctx.chat.id}). Now run /pair target in the helper chat.`,
      );
      return;
    }

    draft.targetChatId = ctx.chat.id;
    draft.targetTitle = title;
    drafts.set(operatorId, draft);
    if (await completeIfReady(ctx, db, drafts, operatorId, draft)) return;
    await ctx.reply(
      t`Target chat recorded (${ctx.chat.id}). Now run /pair source in the main chat.`,
    );
  });

  bot.command("unpair", async (ctx) => {
    if (!(await requireChatAdmin(ctx))) {
      await ctx.reply(t`Only chat admins can configure pairs.`);
      return;
    }
    if (!ctx.chat || ctx.chat.type === "private") {
      await ctx.reply(t`Run /unpair inside a linked source or target chat.`);
      return;
    }
    if (!ctx.from) return;
    const { deleted, blocked } = await deletePairsForChat(
      db,
      ctx.chat.id,
      ctx.from.id,
    );
    if (deleted === 0 && blocked > 0) {
      await ctx.reply(t`This pair was configured by another user.`);
      return;
    }
    if (deleted === 0) {
      await ctx.reply(t`No chat pair includes this chat.`);
      return;
    }
    drafts.clear(ctx.from.id);
    await ctx.reply(t`Deleted ${deleted} chat pair(s) involving this chat.`);
  });

  bot.command("status", async (ctx) => {
    if (!ctx.from) return;

    if (ctx.chat && ctx.chat.type !== "private") {
      const here = await findEnabledPairForChat(db, ctx.chat.id);
      if (!here) {
        const enabled = await listEnabledPairs(db);
        await ctx.reply(
          t`This chat is not in an enabled pair. Enabled pairs: ${enabled.length}.`,
        );
        return;
      }
      const role =
        here.sourceChatId === ctx.chat.id
          ? "source"
          : here.targetChatId === ctx.chat.id
            ? "target"
            : "unknown";
      await ctx.reply(
        t`This chat is the ${role} in pair #${here.id}: ${here.sourceChatId} → ${here.targetChatId}.`,
      );
      return;
    }

    const pairs = await listEnabledPairsForUser(db, ctx.from.id);
    if (pairs.length === 0) {
      await ctx.reply(
        t`No enabled chat pairs. Use /pair source and /pair target, or set SOURCE_CHAT_ID, TARGET_CHAT_ID, and CONFIGURED_BY_USER_ID.`,
      );
      return;
    }
    const lines = pairs.map(
      (p) => `#${p.id}: ${p.sourceChatId} → ${p.targetChatId}`,
    );
    await ctx.reply(t`Enabled pairs:\n${lines.join("\n")}`);
  });
}
