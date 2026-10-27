# ADR-01: Store user data on the device in IndexedDB, through Dexie

**Status:** Accepted · **Requirements:** BEAN-01, JRN-05, DR-03, DR-04, DR-05 · **Decision:** D5 (no accounts in R1)

## Context
The prototype kept the journal in `localStorage`: about 5 MB, synchronous, and photos inlined as data URLs. When it filled up, the app silently dropped photos and then the oldest entries (gaps G4, G5).

## Decision
Use IndexedDB through Dexie (`src/data/db.ts`). Beans, brews, photos and metadata are separate tables. Photos are stored as bytes in their own table (DR-03). The schema is versioned; each change is a new version with an upgrade step (DR-04). A quota error becomes a `StorageFullError` with a plain message; nothing is ever deleted to make room (DR-05). On first launch the old journal is backed up, then migrated idempotently (JRN-05).

## Consequences
- Storage grows to hundreds of MB and survives offline use; reads are asynchronous, so screens load data in effects.
- iOS may still evict data of sites that are not installed (BRD C2). Mitigations: `navigator.storage.persist()`, the PWA install prompt (ADR-05) and export.
- No cloud copy until accounts (R2). Export is the user's backup.

## Alternatives
`localStorage` (the cause of G4/G5). SQLite-WASM (heavier, no benefit at this scale).
