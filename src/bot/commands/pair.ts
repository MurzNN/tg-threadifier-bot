import { t } from "@lingui/core/macro";
import type { Bot, Context } from "grammy";

import {
  disablePairsForChat,
  findEnabledPairForChat,
  listEnabledPairs,
  PairDraftStore,
  upsertChatPair,
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

  const pair = await upsertChatPair(db, {
    sourceChatId: draft.sourceChatId,
    targetChatId: draft.targetChatId,
    sourceTitle: draft.sourceTitle,
    targetTitle: draft.targetTitle,
    sourceUsernameOrPath: draft.sourceUsernameOrPath,
    enabled: true,
  });
  drafts.clear(operatorId);
  await ctx.reply(
    t`Pair enabled: source ${pair.sourceChatId} → target ${pair.targetChatId}. Ingest is active for both chats.`,
  );
  return true;
}

export function registerPairCommands(
  bot: Bot,
  db: AppDb,
  drafts: PairDraftStore,
): void {
  bot.command("pair", async (ctx) => {
    if (!(await requireChatAdmin(ctx))) {
      await ctx.reply(t`Only chat admins can configure pairs.`);
      return;
    }
    if (!ctx.chat || !ctx.from) return;
    if (ctx.chat.type === "private") {
      await ctx.reply(
        t`Run /pair source or /pair target inside the group chats to link.`,
      );
      return;
    }

    const role = (ctx.match ?? "").trim().toLowerCase();
    if (role !== "source" && role !== "target") {
      await ctx.reply(
        t`Usage: /pair source or /pair target (run inside the group).`,
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
    const n = await disablePairsForChat(db, ctx.chat.id);
    if (n === 0) {
      await ctx.reply(t`No enabled pair includes this chat.`);
      return;
    }
    if (ctx.from) drafts.clear(ctx.from.id);
    await ctx.reply(t`Disabled ${n} chat pair(s) involving this chat.`);
  });

  bot.command("status", async (ctx) => {
    const pairs = await listEnabledPairs(db);
    if (pairs.length === 0) {
      await ctx.reply(
        t`No enabled chat pairs. Use /pair source and /pair target, or set SOURCE_CHAT_ID and TARGET_CHAT_ID.`,
      );
      return;
    }

    if (ctx.chat && ctx.chat.type !== "private") {
      const here = await findEnabledPairForChat(db, ctx.chat.id);
      if (!here) {
        await ctx.reply(
          t`This chat is not in an enabled pair. Enabled pairs: ${pairs.length}.`,
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

    const lines = pairs.map(
      (p) => `#${p.id}: ${p.sourceChatId} → ${p.targetChatId}`,
    );
    await ctx.reply(t`Enabled pairs:\n${lines.join("\n")}`);
  });
}
