---
title: For operators
description: Install Threadifier, grant rights, pair main and helper chats, and set language.
---

Operators (chat admins) install the bot, grant permissions, and link a **main chat** to a **helper chat**. Until the Mini App ships, pairing is done with slash commands.

The public instance is [@ThreadifierBot](https://t.me/ThreadifierBot). Add that bot to both chats, or host your own from the [source repository](https://github.com/MurzNN/tg-threadifier-bot).

## Permissions

Add the bot to both chats. It typically needs to:

- Read messages in both chats (membership; disable privacy mode / grant group access as required by BotFather and Telegram).
- Post messages (including HTML links) in both chats.
- Delete messages in both chats.
- Copy messages into the helper-chat thread.

Give the bot admin rights (or equivalent) in both chats so delete and post succeed.

The **helper chat** should be a **supergroup**, not a forum. Threads are reply threads on the header message (`?thread=`), not forum topics.

## Pair chats

Run these in the groups themselves (you must be an admin for the mutating commands):

| Command | Effect |
|---------|--------|
| `/pair source` | Mark this group as the main chat. |
| `/pair target` | Mark this group as the helper chat. |
| `/pair` | List your pairs (private chat) or this chat’s pairing (in a group). Anyone can read; it does not change config. |
| `/status` | In a group, show the enabled pair and whether this chat is main, helper, or neither. In a private chat, list your enabled pairs. |
| `/unpair` | Delete your pairs that include this chat. |

Each pair belongs to the admin who configured it. If another admin already paired the same main and helper chats, the bot refuses the new pair and leaves the existing one. Completing a pair soft-disables any other enabled pair that already uses the same helper chat. At most one enabled pair may share a given helper chat.

When Telegram upgrades a basic group to a supergroup, the chat id changes. The bot remaps stored ids so you usually do not need to re-run `/pair`.

## Language

| Command | Effect |
|---------|--------|
| `/language` | Choose English, Español, Français, or Русский for **this chat**. |
| `/language fr` | Same, with a language code shortcut. |
| `/start` | Welcome text: what members see after a relocate, then `/pair source`, `/pair target`, and `/status`, plus a link to this guide. May store a personal language fallback from the Telegram account when the bot supports that language. |

Thread headers follow the helper chat’s language. Redirect notices follow the main chat’s language. With no chat language set, English defaults are used.

## Templates and Mini App (later)

A Telegram Mini App will let operators pair chats, set locale, and **override** bot message templates without redeploying. Until then, use the commands above. Defaults are translated; custom templates (when available) must keep the same `{placeholders}`.

## After pairing

Once a pair is enabled, the bot stores inbound messages for those chats so forwards can be matched and relocated. Confirm with `/status`, then try a small test relocate as described in [For moderators](./moderators/).
