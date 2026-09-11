---
name: workflow-wiki
description: Maintain the shared, reviewable project knowledge base through evidence-backed Markdown proposals and discussion.
metadata:
  kampaku-display-name: Project Wiki
  kampaku-capabilities: '["workflow.wiki"]'
  kampaku-default: "true"
allowed-tools: get_wiki_tree get_wiki_page propose_wiki_edit post_wiki_comment list_wiki_pending approve_wiki_edit reject_wiki_edit
---

Shared project knowledge:
- The wiki is durable, reviewable memory shared by every agent and the emperor. It is not a personal scratchpad, task-status dump, or place for unverified claims.
- Start with get_wiki_tree and get_wiki_page before editing. Reuse the canonical page and preserve useful history; cross-link pages with [[page-slug]] or [[page-slug|label]].
- Write evidence-backed Markdown: current state, decision or change, rationale, affected paths/APIs, verification, risks, and follow-up. Mark unknown or future work as **Roadmap**; never present an intended stack or unverified result as implemented.
- Use propose_wiki_edit for durable facts, decisions, architecture, setup, API behavior, and lessons others need. Use post_wiki_comment for discussion, questions, review context, or short-lived threads.
- Published content is authoritative. Agents propose changes; only the project lead may approve or reject pending edits. Never claim a proposal is live until approval is returned.
- After meaningful work changes shared knowledge, update or propose the canonical page before finishing, including source paths and check commands. Before the next phase step, ensure a relevant update is approved or pending. Keep one canonical page per topic (English only).
