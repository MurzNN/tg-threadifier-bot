import { renderAuthorSuffix } from "./templates.js";

/** Telegram `sendMessage` text limit, after entity parsing. */
export const MESSAGE_TEXT_MAX = 4096;

/** Telegram caption limit, after entity parsing. */
export const MESSAGE_CAPTION_MAX = 1024;

const AUTHOR_MARK = "\uE000";

const CAPTIONABLE_KEYS = [
  "photo",
  "video",
  "animation",
  "audio",
  "document",
  "voice",
] as const;

export function messageSupportsCaption(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  return CAPTIONABLE_KEYS.some((key) => record[key] != null);
}

export function readMessageEntities(
  raw: unknown,
  key: "entities" | "caption_entities",
): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  const value = (raw as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== "object") return false;
    const entity = item as Record<string, unknown>;
    return (
      typeof entity.type === "string" &&
      typeof entity.offset === "number" &&
      typeof entity.length === "number"
    );
  });
}

/**
 * Append `— {authorName}` to a message body. When `userId` is known, the name
 * is a `text_mention` so it still opens that user’s profile. Original entities
 * that fit in the kept body are preserved.
 */
export function appendAuthorSuffix(input: {
  body: string;
  authorName: string;
  userId: number | null;
  maxLength: number;
  entities?: readonly Record<string, unknown>[];
}): { text: string; entities: Record<string, unknown>[] } {
  const suffix = renderAuthorSuffix(input.authorName);
  const nameOffsetInSuffix = renderAuthorSuffix(AUTHOR_MARK).indexOf(AUTHOR_MARK);
  const gap = input.body.length > 0 ? "\n\n" : "";
  const overhead = gap.length + suffix.length;
  let body = input.body;
  if (body.length + overhead > input.maxLength) {
    const room = Math.max(0, input.maxLength - overhead);
    body = room <= 1 ? "" : `${body.slice(0, room - 1)}…`;
  }
  const text =
    body.length > 0 ? `${body}${gap}${suffix}` : suffix.slice(0, input.maxLength);
  const entities = (input.entities ?? []).filter((entity) => {
    const offset = entity.offset;
    const length = entity.length;
    return (
      typeof offset === "number" &&
      typeof length === "number" &&
      offset >= 0 &&
      offset + length <= body.length
    );
  });
  const nameLength = input.authorName.length;
  const offset = (body.length > 0 ? body.length + gap.length : 0) + nameOffsetInSuffix;
  if (
    input.userId != null &&
    nameOffsetInSuffix >= 0 &&
    nameLength > 0 &&
    offset >= 0 &&
    offset + nameLength <= text.length
  ) {
    entities.push({
      type: "text_mention",
      offset,
      length: nameLength,
      user: {
        id: input.userId,
        is_bot: false,
        first_name: input.authorName.slice(0, 64),
      },
    });
  }
  return { text, entities };
}
