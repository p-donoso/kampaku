import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  repositories_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL,
  acceptance_criteria_json TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  lease_id TEXT,
  lease_expires_at TEXT,
  worker_id TEXT,
  capabilities_json TEXT NOT NULL,
  input_json TEXT NOT NULL,
  idempotency_key TEXT
);

CREATE TABLE IF NOT EXISTS job_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  status TEXT NOT NULL,
  output_json TEXT,
  error_json TEXT,
  finished_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  name TEXT,
  version TEXT,
  capabilities_json TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  registered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  correlation_id TEXT,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bootstrap_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id TEXT,
  source TEXT NOT NULL,
  responsibilities TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roadmap_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  assignee_agent_id TEXT,
  assigned_by_agent_id TEXT,
  routing_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delegation_events (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  from_agent_id TEXT,
  to_agent_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  agent_slug TEXT NOT NULL,
  project_id TEXT,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  created_at TEXT NOT NULL
);
`;

function columnExists(sqlite: Database.Database, table: string, column: string): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((col) => col.name === column);
}

function tableExists(sqlite: Database.Database, table: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table) as { name: string } | undefined;
  return row !== undefined;
}

function migrateSprintsToRecursiveTasks(sqlite: Database.Database): void {
  const migrated = sqlite
    .prepare("SELECT value_json FROM bootstrap_state WHERE key = 'sprints_migrated_v1'")
    .get() as { value_json: string } | undefined;
  if (migrated) return;

  addColumnIfMissing(sqlite, "work_items", "sort_order", "INTEGER NOT NULL DEFAULT 0");

  if (tableExists(sqlite, "sprints") && columnExists(sqlite, "work_items", "sprint_id")) {
    const sprintRows = sqlite.prepare("SELECT * FROM sprints ORDER BY sort_order").all() as Array<{
      id: string;
      project_id: string;
      name: string;
      goal: string | null;
      sort_order: number;
    }>;

    const now = new Date().toISOString();
    const sprintToContainer = new Map<string, string>();

    for (const sprint of sprintRows) {
      const containerId = sprint.id;
      sprintToContainer.set(sprint.id, containerId);
      const existing = sqlite.prepare("SELECT id FROM work_items WHERE id = ?").get(containerId);
      if (!existing) {
        sqlite
          .prepare(
            `INSERT INTO work_items (
              id, project_id, parent_id, title, description, status, priority, sort_order,
              assignee_agent_id, assigned_by_agent_id, routing_reason,
              acceptance_criteria_json, depends_on_json, goal_id, job_id, created_at, updated_at, sprint_id
            ) VALUES (?, ?, NULL, ?, ?, 'todo', 0, ?, NULL, NULL, NULL, '[]', '[]', NULL, NULL, ?, ?, NULL)`,
          )
          .run(containerId, sprint.project_id, sprint.name, sprint.goal, sprint.sort_order ?? 0, now, now);
      }
    }

    const itemsWithSprint = sqlite
      .prepare(
        "SELECT id, sprint_id, parent_id FROM work_items WHERE sprint_id IS NOT NULL AND id NOT IN (SELECT id FROM sprints)",
      )
      .all() as Array<{ id: string; sprint_id: string; parent_id: string | null }>;

    for (const item of itemsWithSprint) {
      const containerId = sprintToContainer.get(item.sprint_id);
      if (!containerId) continue;
      const newParent = item.parent_id ?? containerId;
      sqlite.prepare("UPDATE work_items SET parent_id = ?, sprint_id = NULL WHERE id = ?").run(newParent, item.id);
    }

    sqlite.prepare("UPDATE work_items SET sprint_id = NULL WHERE sprint_id IS NOT NULL").run();
  }

  if (columnExists(sqlite, "work_items", "sprint_id")) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS work_items_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        assignee_agent_id TEXT,
        assigned_by_agent_id TEXT,
        routing_reason TEXT,
        acceptance_criteria_json TEXT,
        depends_on_json TEXT,
        goal_id TEXT,
        job_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO work_items_new (
        id, project_id, parent_id, title, description, status, priority, sort_order,
        assignee_agent_id, assigned_by_agent_id, routing_reason,
        acceptance_criteria_json, depends_on_json, goal_id, job_id, created_at, updated_at
      )
      SELECT
        id, project_id, parent_id, title, description, status, priority,
        COALESCE(sort_order, 0), assignee_agent_id, assigned_by_agent_id, routing_reason,
        acceptance_criteria_json, depends_on_json, goal_id, job_id, created_at, updated_at
      FROM work_items;
      DROP TABLE work_items;
      ALTER TABLE work_items_new RENAME TO work_items;
    `);
  }

  if (tableExists(sqlite, "sprints")) {
    sqlite.exec("DROP TABLE sprints");
  }

  if (tableExists(sqlite, "agent_questions")) {
    addColumnIfMissing(sqlite, "agent_questions", "work_item_status_before_pause", "TEXT");
    if (columnExists(sqlite, "agent_questions", "sprint_id")) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS agent_questions_new (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          work_item_id TEXT,
          asked_by_agent_id TEXT NOT NULL,
          recipient_agent_id TEXT NOT NULL,
          question TEXT NOT NULL,
          context TEXT,
          status TEXT NOT NULL,
          answer TEXT,
          answered_by_agent_id TEXT,
          escalation_path_json TEXT NOT NULL,
          work_item_status_before_pause TEXT,
          created_at TEXT NOT NULL,
          answered_at TEXT
        );
        INSERT INTO agent_questions_new (
          id, project_id, work_item_id, asked_by_agent_id, recipient_agent_id,
          question, context, status, answer, answered_by_agent_id,
          escalation_path_json, work_item_status_before_pause, created_at, answered_at
        )
        SELECT
          id, project_id, work_item_id, asked_by_agent_id, recipient_agent_id,
          question, context, status, answer, answered_by_agent_id,
          escalation_path_json, sprint_status_before_pause, created_at, answered_at
        FROM agent_questions;
        DROP TABLE agent_questions;
        ALTER TABLE agent_questions_new RENAME TO agent_questions;
        CREATE INDEX IF NOT EXISTS idx_agent_questions_status
        ON agent_questions(status, created_at);
      `);
    }
  }

  sqlite
    .prepare(
      "INSERT OR REPLACE INTO bootstrap_state (key, value_json) VALUES ('sprints_migrated_v1', '\"done\"')",
    )
    .run();
}

function addColumnIfMissing(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (!columnExists(sqlite, table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runIncrementalMigrations(sqlite: Database.Database): void {
  addColumnIfMissing(sqlite, "projects", "slug", "TEXT");
  addColumnIfMissing(sqlite, "projects", "status", "TEXT DEFAULT 'planning'");
  addColumnIfMissing(sqlite, "projects", "updated_at", "TEXT");
  addColumnIfMissing(sqlite, "projects", "project_lead_agent_id", "TEXT");
  addColumnIfMissing(sqlite, "projects", "coherence_strategy", "TEXT");

  addColumnIfMissing(sqlite, "roadmap_milestones", "success_criteria_json", "TEXT");
  addColumnIfMissing(sqlite, "roadmap_milestones", "executed_by", "TEXT DEFAULT 'ai_agents'");

  addColumnIfMissing(sqlite, "work_items", "acceptance_criteria_json", "TEXT");
  addColumnIfMissing(sqlite, "work_items", "depends_on_json", "TEXT");
  addColumnIfMissing(sqlite, "work_items", "goal_id", "TEXT");
  addColumnIfMissing(sqlite, "work_items", "job_id", "TEXT");
  addColumnIfMissing(sqlite, "conversations", "summary", "TEXT");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      capabilities_json TEXT NOT NULL,
      tools_json TEXT NOT NULL,
      prompt_fragment TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0
    );
  `);
  addColumnIfMissing(sqlite, "skills", "is_default", "INTEGER NOT NULL DEFAULT 0");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_skills (
      agent_id TEXT NOT NULL,
      skill_slug TEXT NOT NULL,
      PRIMARY KEY (agent_id, skill_slug)
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_questions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      work_item_id TEXT,
      asked_by_agent_id TEXT NOT NULL,
      recipient_agent_id TEXT NOT NULL,
      question TEXT NOT NULL,
      context TEXT,
      status TEXT NOT NULL,
      answer TEXT,
      answered_by_agent_id TEXT,
      escalation_path_json TEXT NOT NULL,
      work_item_status_before_pause TEXT,
      created_at TEXT NOT NULL,
      answered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_questions_status
    ON agent_questions(status, created_at);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_blockages (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      work_item_id TEXT,
      reported_by_agent_id TEXT NOT NULL,
      recipient_agent_id TEXT NOT NULL,
      description TEXT NOT NULL,
      context TEXT,
      status TEXT NOT NULL,
      resolution TEXT,
      resolution_kind TEXT,
      resolved_by_agent_id TEXT,
      escalation_path_json TEXT NOT NULL,
      work_item_status_before_pause TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_blockages_status
    ON agent_blockages(status, created_at);
  `);

  migrateSprintsToRecursiveTasks(sqlite);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug)
    WHERE slug IS NOT NULL;
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages(conversation_id, created_at);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('log', 'learning')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      summary TEXT,
      relevance INTEGER NOT NULL DEFAULT 3,
      project_id TEXT,
      conversation_id TEXT,
      work_item_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      access_count INTEGER NOT NULL DEFAULT 0,
      first_accessed_at TEXT,
      last_accessed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_kind_created
    ON agent_memories(agent_id, kind, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_memories_project
    ON agent_memories(project_id, created_at DESC);
  `);
  addColumnIfMissing(sqlite, "agent_memories", "access_count", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "agent_memories", "first_accessed_at", "TEXT");
  addColumnIfMissing(sqlite, "agent_memories", "last_accessed_at", "TEXT");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS work_item_journal_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      anchor_work_item_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      from_agent_id TEXT,
      to_agent_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      ref_type TEXT,
      ref_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_item_journal_anchor
    ON work_item_journal_entries(anchor_work_item_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_work_item_journal_project
    ON work_item_journal_entries(project_id, occurred_at DESC);
  `);

  addColumnIfMissing(sqlite, "project_documents", "parent_id", "TEXT");
  addColumnIfMissing(sqlite, "project_documents", "status", "TEXT NOT NULL DEFAULT 'published'");
  addColumnIfMissing(sqlite, "project_documents", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "project_documents", "proposed_content_md", "TEXT");
  addColumnIfMissing(sqlite, "project_documents", "proposed_title", "TEXT");
  addColumnIfMissing(sqlite, "project_documents", "proposed_by_agent_id", "TEXT");
  addColumnIfMissing(sqlite, "project_documents", "proposed_at", "TEXT");
  addColumnIfMissing(sqlite, "project_documents", "approved_by_agent_id", "TEXT");
  addColumnIfMissing(sqlite, "project_documents", "approved_at", "TEXT");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS wiki_page_comments (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      parent_comment_id TEXT,
      author_agent_id TEXT,
      author_name TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_page_comments_page
    ON wiki_page_comments(page_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_wiki_page_comments_project
    ON wiki_page_comments(project_id, created_at DESC);
  `);

  const projectsWithoutSlug = sqlite
    .prepare("SELECT id, name FROM projects WHERE slug IS NULL")
    .all() as Array<{ id: string; name: string }>;

  for (const row of projectsWithoutSlug) {
    const slug = row.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || row.id.slice(0, 8);
    sqlite
      .prepare("UPDATE projects SET slug = ?, status = COALESCE(status, 'active'), updated_at = COALESCE(updated_at, created_at) WHERE id = ?")
      .run(slug, row.id);
  }
}

export type Db = BetterSQLite3Database<typeof schema>;

export function createDb(dbPath: string): { db: Db; sqlite: Database.Database } {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(MIGRATION_SQL);
  runIncrementalMigrations(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
