type UniqueFile = { file_unique_id?: string };

export type MediaFields = {
  photo?: readonly UniqueFile[];
  animation?: UniqueFile;
  audio?: UniqueFile;
  document?: UniqueFile;
  sticker?: UniqueFile;
  video?: UniqueFile;
  video_note?: UniqueFile;
  voice?: UniqueFile;
};

export function mediaUniqueIds(msg: MediaFields): string[] {
  const ids: string[] = [];
  const push = (id?: string) => {
    if (id) ids.push(id);
  };
  push(msg.photo?.at(-1)?.file_unique_id);
  push(msg.animation?.file_unique_id);
  push(msg.audio?.file_unique_id);
  push(msg.document?.file_unique_id);
  push(msg.sticker?.file_unique_id);
  push(msg.video?.file_unique_id);
  push(msg.video_note?.file_unique_id);
  push(msg.voice?.file_unique_id);
  return ids;
}

export function messageText(msg: object): string | null {
  if (!("text" in msg)) return null;
  const value = (msg as { text?: string | null }).text;
  return value ?? null;
}

export function messageCaption(msg: object): string | null {
  if (!("caption" in msg)) return null;
  const value = (msg as { caption?: string | null }).caption;
  return value ?? null;
}

export function serializeForwardOrigin(msg: {
  forward_origin?: unknown;
}): string | null {
  if (!msg.forward_origin) return null;
  try {
    return JSON.stringify(msg.forward_origin);
  } catch {
    return null;
  }
}
