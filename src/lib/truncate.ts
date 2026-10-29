/** Default header title max length (Telegram-friendly; refine in M2 if needed). */
export const THREAD_TITLE_MAX = 120;

/** Recent-thread button: `{threadTitle}` shortened to 12 characters. */
export const THREAD_TITLE_BUTTON_MAX = 12;

export function truncateText(
  value: string,
  max: number,
  ellipsis = "…",
): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  if (max <= ellipsis.length) return normalized.slice(0, max);
  return `${normalized.slice(0, max - ellipsis.length)}${ellipsis}`;
}

export function resolveTruncatedTitles(rootText: string): {
  threadTitle: string;
  threadTitle12: string;
} {
  const threadTitle = truncateText(rootText, THREAD_TITLE_MAX);
  return {
    threadTitle,
    threadTitle12: truncateText(threadTitle, THREAD_TITLE_BUTTON_MAX, ""),
  };
}
