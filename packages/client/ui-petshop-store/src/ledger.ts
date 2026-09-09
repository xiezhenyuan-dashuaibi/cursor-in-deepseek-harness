/**
 * SQLite booking ledger: insert and list. Host-only.
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { PetshopBookingDraft, PetshopBookingRow } from './wire.ts'
import { asPetshopBookingRow } from './wire.ts'

/** File name under the resolved DeepSeek Harness home. */
export const PETSHOP_STORE_FILE = 'petshop-store.sqlite'

/**
 * Resolve the on-disk ledger path.
 * @param override - test path; omitted uses `$DSH_HOME/petshop-store.sqlite`.
 * @returns an absolute sqlite path.
 */
export function resolvePetshopStorePath(override?: string): string {
  return override ?? dshHomePath(PETSHOP_STORE_FILE)
}

/** Insert/list/close face provided as Cordis `petshopStore`. */
export interface PetshopStoreApi {
  /**
   * Persist one booking and return the stored row.
   * @param draft - hub-validated booking fields.
   * @returns the row including id and createdAt.
   */
  insert: (draft: PetshopBookingDraft) => PetshopBookingRow
  /**
   * Read every booking, newest first.
   * @returns persisted rows.
   */
  list: () => PetshopBookingRow[]
  /** Close the sqlite handle. */
  close: () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Booking ledger consumed by the petshop hub. */
    petshopStore: PetshopStoreApi
  }
}

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  dog_name TEXT NOT NULL,
  breed TEXT NOT NULL,
  owner TEXT NOT NULL,
  phone TEXT NOT NULL,
  package_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  created_at TEXT NOT NULL
)`

const INSERT_SQL = `INSERT INTO bookings (
  id, dog_name, breed, owner, phone, package_id, slot, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

const LIST_SQL = `SELECT
  id,
  dog_name AS dogName,
  breed,
  owner,
  phone,
  package_id AS packageId,
  slot,
  created_at AS createdAt
FROM bookings
ORDER BY created_at DESC`

/**
 * Open (or create) the booking database.
 * @param path - sqlite file path. Parent directories are created.
 * @returns the store API; caller must `close()`.
 */
export function openPetshopLedger(path: string): PetshopStoreApi {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(CREATE_SQL)
  const insertStmt = db.prepare(INSERT_SQL)
  const listStmt = db.prepare(LIST_SQL)
  return {
    insert(draft: PetshopBookingDraft): PetshopBookingRow {
      const id = randomUUID()
      const createdAt = new Date().toISOString()
      insertStmt.run(
        id,
        draft.dogName,
        draft.breed,
        draft.owner,
        draft.phone,
        draft.packageId,
        draft.slot,
        createdAt,
      )
      return { ...draft, id, createdAt }
    },
    list(): PetshopBookingRow[] {
      const raw = listStmt.all()
      const rows: PetshopBookingRow[] = []
      for (const item of raw) {
        const row = asPetshopBookingRow(item)
        if (row === undefined) {
          throw new Error('petshop-store: sqlite row failed booking validation')
        }
        rows.push(row)
      }
      return rows
    },
    close(): void {
      db.close()
    },
  }
}
