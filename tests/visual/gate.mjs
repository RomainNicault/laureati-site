// Dépouille gates.json produit par capture.mjs et fixe le code de sortie du job.
// Usage : node tests/visual/gate.mjs [chemin/gates.json]
import fs from 'node:fs';
import { lighthouseFailures } from './lighthouse.mjs';

const file = process.argv[2] || 'tests/visual/out/gates.json';
if (!fs.existsSync(file)) {
  console.error(`::error::${file} introuvable : les captures n'ont pas abouti`);
  process.exit(1);
}
let report;
try {
  report = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('objet attendu');
} catch (err) {
  console.error(`::error::${file} illisible : ${err.message}`);
  process.exit(1);
}
report.failures = report.failures || [];
report.warnings = report.warnings || [];
report.pages = report.pages || {};
const expectedPages = JSON.parse(fs.readFileSync(new URL('./pages.json', import.meta.url), 'utf8'));
report.failures.push(...lighthouseFailures(report.lighthouse, expectedPages));
report.gates_ok = report.gates_ok === true && report.failures.length === 0;
const pages = Object.keys(report.pages);
const shots = pages.reduce((n, id) => n + Object.keys(report.pages[id]).filter(k => k.startsWith('m') || k.startsWith('t') || k.startsWith('d')).length, 0);
console.log(`Pages capturées : ${pages.length} (${pages.join(', ')}) — ${shots} captures`);
if (report.lighthouse) console.log(`Lighthouse mobile (bloquant : performance >= 90, accessibilité >= 95) : ${JSON.stringify(report.lighthouse)}`);
for (const w of report.warnings || []) console.log(`::notice::${w}`);
for (const f of report.failures || []) console.error(`::error::${f}`);

// Résumé lisible dans l'onglet Actions.
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `## Contrôle visuel — ${report.gates_ok ? 'vert' : 'rouge'}`,
    '',
    `${pages.length} pages × 3 largeurs (360/768/1280), ${shots} captures PNG dans l'artefact \`controle-visuel\`.`,
    '',
  ];
  if (report.lighthouse) {
    lines.push('| Page | Performance | Accessibilité | Bonnes pratiques | SEO |', '| --- | --- | --- | --- | --- |');
    for (const [id, s] of Object.entries(report.lighthouse)) {
      lines.push(`| ${id} | ${s.performance} | ${s.accessibility} | ${s['best-practices']} | ${s.seo} |`);
    }
    lines.push('', 'Lighthouse mobile est bloquant : performance >= 90, accessibilité >= 95. Rapport absent ou illisible = échec.');
  }
  if (report.failures.length) {
    lines.push('', '### Échecs', ...report.failures.map(f => `- ${f}`));
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

if (!report.gates_ok) {
  console.error(`::error::Portes visuelles en échec (${report.failures.length})`);
  process.exit(1);
}
console.log('Portes visuelles au vert');
