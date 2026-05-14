import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'vlr_data.db');

export type MapComp = { map: string; agents: string[] };

export function openDb(): Database.Database {
    const db = new Database(DB_PATH);
    db.exec(`
        CREATE TABLE IF NOT EXISTS matches (
            url TEXT PRIMARY KEY,
            scraped_at INTEGER NOT NULL,
            order_idx INTEGER
        );
        CREATE TABLE IF NOT EXISTS map_compositions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_url TEXT NOT NULL,
            map TEXT NOT NULL,
            agents TEXT NOT NULL,
            FOREIGN KEY (match_url) REFERENCES matches(url)
        );
        CREATE INDEX IF NOT EXISTS idx_map_lower ON map_compositions(lower(map));
    `);
    // Migrate existing databases that predate order_idx
    try { db.exec('ALTER TABLE matches ADD COLUMN order_idx INTEGER'); } catch { /* already exists */ }
    return db;
}

export function getStoredMatchUrls(db: Database.Database): Set<string> {
    const rows = db.prepare('SELECT url FROM matches').all() as Array<{ url: string }>;
    return new Set(rows.map(r => r.url));
}

export function storeMatch(db: Database.Database, url: string, comps: MapComp[], orderIdx: number): void {
    const insertMatch = db.prepare('INSERT OR IGNORE INTO matches (url, scraped_at, order_idx) VALUES (?, ?, ?)');
    const insertComp = db.prepare('INSERT INTO map_compositions (match_url, map, agents) VALUES (?, ?, ?)');

    db.transaction(() => {
        insertMatch.run(url, Date.now(), orderIdx);
        for (const comp of comps) {
            insertComp.run(url, comp.map, JSON.stringify(comp.agents));
        }
    })();
}

export function findMapComps(db: Database.Database, mapName: string): MapComp {
    const row = db.prepare(`
        SELECT mc.map, mc.agents
        FROM map_compositions mc
        JOIN matches m ON mc.match_url = m.url
        WHERE lower(mc.map) = lower(?)
        ORDER BY COALESCE(m.order_idx, 999999) ASC
        LIMIT 1
    `).get(mapName) as { map: string; agents: string } | undefined;
    if (!row) throw new Error(`No map named "${mapName}" found in cached data.`);
    return { map: row.map, agents: JSON.parse(row.agents) as string[] };
}
