---
name: system-agent-roster
description: Govern the agent hierarchy, role boundaries, and least-privilege team shape.
metadata:
  kampaku-display-name: Agent Roster Governance
  kampaku-capabilities: '["system.agents"]'
allowed-tools: create_sub_agent update_sub_agent delete_sub_agent list_agents
---

Agent hierarchy:
- All generated agents form a tree rooted at kampaku.
- Use parent_slug when creating sub-agents to nest them under the right parent (default: kampaku).
- Create parent agents before their children.
- Use list_agents when you need to inspect the tree before restructuring.

Project team recipe (mandatory for new project teams):
1. Create the project lead first: slug like {project}-lead or {project}-manager with parent_slug kampaku.
2. Create each specialist with parent_slug set to the project lead slug — never parent specialists directly under kampaku when a lead exists.
3. Link the project to the lead via update_project (project_lead_slug).
4. Call list_agents after creation to verify nesting (lead under kampaku, specialists under lead).
5. Document the final tree shape in the project journal (delegation or completion report) listing lead slug and specialist slugs.
6. Assign role-specific skills to specialists (e.g. nextjs-dev for frontend, audit-deliverable-readiness + audit-phase-gate + docs-writer for {project}-auditor, qa-testing for QA, api-integration for backend) — do not grant system-architect to every agent as a shortcut for code.agent.

Default six-role project team (mandatory for new projects):
- {project-slug}-lead (parent: kampaku) — project lead, system-delegation
- {project-slug}-frontend, -backend, -qa, -auditor — parent: project lead
- Auditor owns deliverable-readiness and phase-gate reviews; specialists must not receive fullstack phases alone.
- submit_intent with a new project auto-creates this roster when create_missing_agents is true (default for new projects).

Platform team isolation (mandatory):
- Agents under kampaku-manager (kampaku-ux-ui, kampaku-fullstack, kampaku-qa, kampaku-documenter, kampaku-auditor, kampaku-skillmaster, kampaku-security) serve ONLY the kampaku self-improvement project.
- External projects must use their own {project}-* team — never recycle platform agents as assignees.
- Each agent has exactly one parent in the tree; cross-project assignment is forbidden, not dual hierarchy.

Reference pattern: {domain}-manager under the project lead, {domain}-* specialists under the manager.

Golden rule — platform parity (agents that own or implement platform features):
- Every capability must be reachable from both apps/web and the Commander CLI; neither surface may do something the other cannot.
- Each managed resource ships complete CRUD (Create, Read, Update, Delete) across API, CLI, OpenAPI/contracts, and web UI when applicable.
- When proposing or creating such agents, state how web and CLI will stay in parity and which CRUD operations they own.
- Grant skills and tools under least privilege — only what the role strictly needs.

Agent creation:
- NEVER call create_sub_agent for a vague request. When an end-to-end build request explicitly authorizes staffing, create the minimum concrete team required by the approved scope without asking the same approval twice.
- When a new agent may help, first describe: slug, name, parent_slug, responsibilities, and the planned system_prompt summary.
- Ask a direct yes/no question (or ask what to change) and wait for the emperor's answer in chat.
- After clear approval (or explicit end-to-end authorization), call create_sub_agent with the agreed fields. Default workflow skills are assigned automatically.
- If the emperor declines or wants changes, revise the proposal and ask again; do not create silently.

Other roster tools:
- update_sub_agent: change name, responsibilities, system_prompt, or parent_slug.
- delete_sub_agent: remove a leaf agent (no children). Delete deepest agents first. Ask before deleting unless the emperor already requested it.
