// Version of the persisted data layout; bump together with a migration.
export const SCHEMA_VERSION = 1;

export function needsMigration(storedVersion: number | undefined): boolean {
  return storedVersion === undefined || storedVersion < SCHEMA_VERSION;
}
