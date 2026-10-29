---
title: For moderators
description: How moderators relocate offtopic messages with Threadifier by forwarding them into the helper chat.
---

Threadifier automates the cleanup after you decide something is offtopic. You still choose **what** to move; the bot does the rest.

## Relocate offtopic

1. In the **main chat**, select the offtopic root and the replies that belong with it.
2. Forward those messages to the linked **helper chat** (one forward or a short burst of forwards).
3. Wait a moment while the bot works.

### What the bot does

- Posts a **thread header** in the helper chat (title, who started it, link back to the main chat, and a thread link).
- Copies the other messages into that reply thread, keeping each original author’s name on the text or caption when possible.
- Deletes the temporary forwards you used as the trigger.
- Deletes the originals from the main chat.
- Posts a **redirect notice** in the main chat so members can follow the conversation.

You do not need to hand-edit links or re-forward messages one by one.

## Tips

- Forward from the **linked** main chat into the **linked** helper chat. Unrelated forwards are ignored for relocate.
- A single message is enough — the bot still creates a thread, cleans up, and posts the notice.
- If the bot cannot match your forward to stored history, it should **not** delete anything and should tell you in the helper chat. Try again after the bot has been in both chats long enough to see the messages, or ask an operator to check pairing and rights.
- If the bot lacks delete or post rights, relocate may stop before destructive steps. An operator needs to fix permissions.

## Keep the helper chat for moderation

Anyone who can forward messages from the main chat into the helper chat can start a relocate. Keep the helper chat limited to moderators (or another trusted group), not the whole community, unless that is intentional.

## Language

Thread headers use the helper chat’s language. Redirect notices use the main chat’s language. Use `/language` in each chat (or ask an operator) if the defaults are wrong. See also [For members](./members/) and [For operators](./operators/).
