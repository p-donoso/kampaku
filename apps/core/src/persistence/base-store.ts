import type { Db } from "./db.js";

/**
 * Standard error codes across persistence stores.
 */
export type StoreErrorCode = "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "VALIDATION" | "INTERNAL";

/**
 * Base error class for all persistence store exceptions.
 */
export class BaseStoreError extends Error {
  constructor(
    message: string,
    readonly code: StoreErrorCode,
  ) {
    super(message);
    this.name = "BaseStoreError";
  }
}

/**
 * Abstract base class for persistence stores providing shared SQLite database access.
 */
export abstract class BaseStore {
  /**
   * Initializes the store with a Drizzle database instance.
   * @param db - The SQLite database instance.
   */
  constructor(protected readonly db: Db) {}

  /**
   * Protected getter for direct database operations.
   */
  protected get database(): Db {
    return this.db;
  }
}
