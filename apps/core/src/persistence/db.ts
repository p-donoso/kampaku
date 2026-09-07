import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";
import { MIGRATION_SQL, runIncrementalMigrations } from "./migrations.js";

export type Db = BetterSQLite3Database<typeof schema>;

export interface DatabaseConnection {
  db: Db;
  sqlite: Database.Database;
  close: () => void;
}

export function createDb(dbPath: string): DatabaseConnection {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(MIGRATION_SQL);
  runIncrementalMigrations(sqlite);

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
}
