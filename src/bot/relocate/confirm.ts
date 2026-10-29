import { InlineKeyboard } from "grammy";

import type { StoredThread } from "../../db/relocation.js";
import { truncateText, THREAD_TITLE_BUTTON_MAX } from "../../lib/truncate.js";
import type { RelocationDraft } from "./drafts.js";
import type { ResolvedRelocation } from "./run.js";
import {
  PREVIEW_LINE_COUNT,
  authorLabel,
  buttonAttachThread,
  buttonCreateThread,
  buttonCustomTitle,
  buttonDeleteMessages,
  buttonRecentThread,
  renderConfirmPrompt,
  renderPickPrompt,
  renderPreviewLine,
  renderTitlePrompt,
  resolveRootTitles,
} from "./templates.js";

export type PromptView = {
  text: string;
  reply_markup: InlineKeyboard;
};

export function callbackAction(action: "new" | "title" | "attach" | "drop", draftId: string): string {
  return `reloc:${action}:${draftId}`;
}

export function pickCallback(draftId: string, threadId: number): string {
  return `reloc:pick:${draftId}:${threadId}`;
}

const CALLBACK_RE = /^reloc:(new|title|attach|drop|pick):([0-9a-z]+)(?::(\d+))?$/;

export type ParsedCallback =
  | { action: "new" | "title" | "attach" | "drop"; draftId: string }
  | { action: "pick"; draftId: string; threadId: number };

export function parseRelocateCallback(data: string): ParsedCallback | null {
  const match = CALLBACK_RE.exec(data);
  if (!match) return null;
  const action = match[1];
  const draftId = match[2];
  if (!action || !draftId) return null;
  if (action === "pick") {
    const threadId = Number(match[3]);
    if (!Number.isInteger(threadId)) return null;
    return { action, draftId, threadId };
  }
  if (action === "new" || action === "title" || action === "attach" || action === "drop") {
    return { action, draftId };
  }
  return null;
}

export function renderDraftPrompt(
  draft: RelocationDraft,
  threads: StoredThread[] = [],
): PromptView {
  const summary = summaryOf(draft.plan);
  if (draft.step === "title") {
    return {
      text: renderTitlePrompt(summary),
      reply_markup: deleteKeyboard(draft.id),
    };
  }
  if (draft.step === "pick") {
    return {
      text: renderPickPrompt(summary),
      reply_markup: pickKeyboard(draft.id, threads),
    };
  }
  return {
    text: renderConfirmPrompt(summary),
    reply_markup: confirmKeyboard(draft.id),
  };
}

function summaryOf(plan: ResolvedRelocation): {
  count: number;
  threadTitle: string;
  lines: string[];
  hiddenCount: number;
} {
  const lines = plan.resolved.map((item) => {
    const author = authorLabel(item.authorName);
    const raw = (item.message.text ?? item.message.caption ?? "").trim();
    const body = raw || resolveRootTitles(null, null).threadTitle;
    return renderPreviewLine(author, body);
  });
  return {
    count: plan.resolved.length,
    threadTitle: plan.threadTitle,
    lines: lines.slice(0, PREVIEW_LINE_COUNT),
    hiddenCount: Math.max(0, lines.length - PREVIEW_LINE_COUNT),
  };
}

function confirmKeyboard(draftId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(buttonCreateThread(), callbackAction("new", draftId))
    .row()
    .text(buttonCustomTitle(), callbackAction("title", draftId))
    .row()
    .text(buttonAttachThread(), callbackAction("attach", draftId))
    .row()
    .text(buttonDeleteMessages(), callbackAction("drop", draftId));
}

function deleteKeyboard(draftId: string): InlineKeyboard {
  return new InlineKeyboard().text(buttonDeleteMessages(), callbackAction("drop", draftId));
}

function pickKeyboard(draftId: string, threads: StoredThread[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const thread of threads) {
    const short = truncateText(thread.threadTitle, THREAD_TITLE_BUTTON_MAX, "");
    keyboard.text(buttonRecentThread(short), pickCallback(draftId, thread.id)).row();
  }
  keyboard.text(buttonDeleteMessages(), callbackAction("drop", draftId));
  return keyboard;
}
