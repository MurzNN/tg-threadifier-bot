---
title: For members
description: What chat members see when Threadifier relocates offtopic messages, and which commands you can use.
---

You do not need to configure Threadifier. Moderators and operators handle that. As a regular member you mainly notice what happens after offtopic is moved, and you can set the language for a chat.

## In the main chat

When moderators relocate an offtopic cluster:

- Those messages disappear from the main chat.
- A short **redirect notice** remains, with a link to the new thread in the helper chat.

English default (wording may differ if the chat uses another language or a custom template):

> The message "…" from *someone* with responses forwarded to the chat *helper*. Please continue the conversation there.

Follow the link in the notice to keep talking in the right place.

## In the helper chat

Relocated digressions become a **reply thread**:

- A **header** names the thread, who started it, and where it came from, plus a shareable thread link.
- Follow-up messages appear as replies under that header. Copied messages usually end with the original author’s name (for example `— Alex`).

Continue the conversation by **replying in that thread**, not as a loose top-level message in the helper chat.

### Messages outside a thread (coming soon)

A later update will prompt you when you post a top-level message in the helper chat that is not part of a thread. You will be able to attach it to a recent thread or start a new one. Until that lands, prefer replying inside an existing thread.

## Commands you can use

| Command | What it does |
|---------|----------------|
| `/start` | Shows a welcome message. May remember your Telegram language as a personal fallback when the bot supports it. |
| `/language` | Sets the language for **this chat** (English, Español, Français, or Русский). Another chat keeps its own setting. |

Anyone who can send messages can also **read** `/pair` or `/status` to see how this chat is linked. In a private chat those commands list only the pairs you configured. Changing pairs (`/pair source`, `/pair target`, `/unpair`) is for admins — see [For operators](./operators/). `/unpair` deletes the admin’s own pairs for that chat.

## What you do not do

- You do not open a Mini App or edit bot templates (that is for operators).
- You do not start a relocate yourself — that begins only when a moderator forwards messages from the main chat into the helper chat.
