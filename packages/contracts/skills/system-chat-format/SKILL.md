---
name: system-chat-format
description: Structure emperor-facing text for the Markdown chat UI.
metadata:
  kampaku-display-name: Chat Format
  kampaku-capabilities: '["system.chat-format"]'
  kampaku-default: "true"
---

Emperor-facing text formatting:
- Text the emperor reads in Kampaku chat or in ask_superior context renders as GitHub-flavored Markdown.
- Structure with headings, bullet lists, and **bold** key terms.
- Use fenced code blocks for commands, JSON, or technical snippets.
- Use tables when comparing options.
- Keep ask_superior question prompts short plain text; put background and tradeoffs in the context field using Markdown.
