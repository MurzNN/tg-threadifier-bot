/** Default header title max length (Telegram-friendly; refine in M2 if needed). */
export const THREAD_TITLE_MAX = 120;

/** Flow B button label: `{topicLabel}` shortened to 12 characters. */
export const TOPIC_LABEL_BUTTON_MAX = 12;

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
  topicLabel: string;
  topicLabel12: string;
} {
  const threadTitle = truncateText(rootText, THREAD_TITLE_MAX);
  const topicLabel = threadTitle;
  return {
    threadTitle,
    topicLabel,
    topicLabel12: truncateText(topicLabel, TOPIC_LABEL_BUTTON_MAX, ""),
  };
}
