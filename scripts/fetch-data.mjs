// Récupère les données publiées avant le build : export et textes éditoriaux
// vivent dans le dépôt privé `laureati-data`, jamais dans ce dépôt.
//
// Clé de déploiement en lecture seule, en base64, dans LAUREATI_DATA_DEPLOY_KEY
// (variable secrète de Workers Builds et secret GitHub Actions). En CI (`CI=true`,
// posé par Workers Builds et GitHub Actions), une clé absente ou une récupération
// en échec arrête le build : jamais de repli silencieux sur l'échantillon fictif.
// Hors CI et sans clé (développement local), rien n'est récupéré : data/sample sert.
//
// Écrit public/data-version.json (commit des données, date d'export) : la sonde
// de reconstruction compare ce commit servi au dernier commit de laureati-data.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = process.env.LAUREATI_DATA_REPO || 'git@github.com:RomainNicault/laureati-data.git';
const REF = process.env.LAUREATI_DATA_REF || 'main';
// Clé publiée par GitHub (https://api.github.com/meta, ssh_keys) : hôte vérifié, jamais accept-new.
const GITHUB_HOST_KEY = 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';
const DOSSIERS = ['export', 'textes'];

// Lève une erreur plutôt que process.exit : le bloc finally efface toujours la clé.
const fail = (message) => { throw new Error(message); };

const encoded = process.env.LAUREATI_DATA_DEPLOY_KEY;
let work;
try {
  if (!encoded && process.env.CI !== 'true') {
    console.log('fetch-data : hors CI sans clé, données non récupérées (échantillon de data/sample)');
    process.exit(0);
  }
  if (!encoded) fail('LAUREATI_DATA_DEPLOY_KEY absente : données privées inaccessibles, build refusé');
  work = mkdtempSync(join(tmpdir(), 'laureati-data-'));
  const key = join(work, 'cle');
  const known = join(work, 'known_hosts');
  writeFileSync(key, Buffer.from(encoded, 'base64').toString('utf8').replace(/\r/g, '').trimEnd() + '\n', { mode: 0o600 });
  writeFileSync(known, GITHUB_HOST_KEY + '\n', { mode: 0o600 });
  const ssh = `ssh -i "${key}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="${known}" -o BatchMode=yes`;
  const clone = join(work, 'depot');
  try {
    execFileSync('git', ['clone', '--quiet', '--depth', '1', '--single-branch', '--branch', REF, REPO, clone],
      { env: { ...process.env, GIT_SSH_COMMAND: ssh, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch {
    fail(`clone de ${REPO} (${REF}) impossible`);
  }
  const commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const meta = JSON.parse(readFileSync(join(clone, 'data/export/meta.json'), 'utf8'));
  if (!meta.exporte_le) fail('data/export/meta.json sans exporte_le');

  for (const dossier of DOSSIERS) {
    const source = join(clone, 'data', dossier);
    const cible = resolve('data', dossier);
    if (!existsSync(source)) fail(`data/${dossier} absent de ${REPO}`);
    rmSync(cible, { recursive: true, force: true });
    cpSync(source, cible, { recursive: true });
  }
  mkdirSync(resolve('public'), { recursive: true });
  writeFileSync(resolve('public/data-version.json'),
    JSON.stringify({ data_commit: commit, exporte_le: meta.exporte_le }) + '\n');
  console.log(`fetch-data : données ${commit.slice(0, 7)} (export du ${meta.exporte_le})`);
} catch (error) {
  console.error(`fetch-data : ${error.message}`);
  process.exitCode = 1;
} finally {
  if (work) rmSync(work, { recursive: true, force: true });
}
