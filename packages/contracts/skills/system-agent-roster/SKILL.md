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
0. Create the project container first with create_project, passing name, repositories, and project_lead_slug. Nothing else creates it: creating agents, delegating, or submitting an intent does not. Until this step runs there is no project for anyone to govern, and any project-scoped call fails with "Project not found".
1. Create the project lead first: slug like {project}-lead or {project}-manager with parent_slug kampaku.
2. Create each specialist with parent_slug set to the project lead slug — never parent specialists directly under kampaku when a lead exists.
3. The lead is already linked: step 0 passed project_lead_slug, and linking a lead afterwards is not something this desk can do.
4. Call list_agents after creation to verify nesting (lead under kampaku, specialists under lead).
5. Document the final tree shape in the project journal (delegation or completion report) listing lead slug and specialist slugs.
6. Assign role-specific skills that match the station's aspect — verification and audit recur; the rest follows the repository. Do not grant system-architect to every agent as a shortcut for a coding tool.

Which stations a project needs (mandatory rule):
- **Read the repository first.** Its manifests, lockfiles, CI config, and directory layout say what the
  project is. A Terraform module, a data pipeline, a Go CLI, and a Next.js app need different stations, and
  the roster has to follow the repository rather than a template.
- **Do not staff a fixed roster.** Naming `-frontend` and `-backend` for every project is the defect this
  rule replaces: it staffs a data pipeline with a frontend, and it makes the factory look like a
  web-product generator whatever the work is.
- Station names come from what is on disk: a renderer, a schema owner, a pipeline owner, a module owner, a
  migration owner — whatever the aspects actually are. `-qa` and `-auditor` recur because verification and
  independent audit are aspects of every software deliverable, not because they are a template.
- **Ask which aspects to cover when they are ambiguous.** If the repository does not settle it, propose
  what you read and ask — do not default, and do not decide on the emperor's behalf that every project is
  an application.
- An auditor owns deliverable-readiness and phase-gate reviews; specialists must not receive fullstack
  phases alone.

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
