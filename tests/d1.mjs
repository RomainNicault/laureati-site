import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const directory = new URL('../migrations/', import.meta.url);

function schema() {
  return readdirSync(directory).filter(name => name.endsWith('.sql')).sort()
    .map(name => readFileSync(new URL(name, directory), 'utf8')).join('\n');
}

// Worker environment backed by node:sqlite with every migration applied.
export function environment() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema());
  return { TURNSTILE_SECRET_KEY: 'secret-test', db, DB: { prepare(sql) { return { bind(...values) { return { async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; } }; } }; } }, ASSETS: { async fetch() { return new Response('static'); } } };
}

export function insertCorrection(db, { recu_le, ip_hash = 'a'.repeat(64), page = '/vignerons/0123456789-exemple/', champ = 'adresse', valeur_proposee = '1 rue Exemple' }) {
  return Number(db.prepare('INSERT INTO correction (recu_le, page, producer_id, champ, valeur_proposee, commentaire, contact, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(recu_le, page, null, champ, valeur_proposee, '', null, ip_hash).lastInsertRowid);
}
