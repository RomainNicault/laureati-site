// Contrôle visuel et accessibilité d'un build Astro servi localement.
// Usage : node tests/visual/capture.mjs <baseUrl> <outDir> [--lighthouse]
// Écrit <outDir>/gates.json. Sortie non nulle si une porte bloquante échoue.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { mainText, smallTargets } from './checks.mjs';
import { lighthouseFailures } from './lighthouse.mjs';

const [,, base = 'http://127.0.0.1:4329', out = './out', ...flags] = process.argv;
const PAGES = JSON.parse(fs.readFileSync(new URL('./pages.json', import.meta.url), 'utf8'));
const WIDTHS = [
  { name: 'm360', width: 360, height: 780, mobile: true },
  { name: 't768', width: 768, height: 1024, mobile: true },
  { name: 'd1280', width: 1280, height: 800, mobile: false },
];
fs.mkdirSync(out, { recursive: true });

// Résolution par défaut de Playwright : aucun chemin de navigateur n'est figé.
// La variable CHROME reste disponible pour un poste où le binaire est ailleurs.
const launchOptions = process.env.CHROME ? { executablePath: process.env.CHROME } : {};
const browser = await chromium.launch(launchOptions);
const report = { base, pages: {}, gates_ok: true, failures: [], warnings: [] };

for (const p of PAGES) {
  const url = base + p.path;
  report.pages[p.id] = {};
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: 1, isMobile: w.mobile, hasTouch: w.mobile });
    const page = await ctx.newPage();
    const resp = await page.goto(url, { waitUntil: 'networkidle' });
    if (!resp || resp.status() >= 400) {
      report.failures.push(`${p.id}/${w.name}: HTTP ${resp && resp.status()}`);
      await ctx.close();
      continue;
    }
    await page.evaluate(() => document.fonts.ready);
    const fullH = await page.evaluate(() => document.documentElement.scrollHeight);
    const clipH = Math.min(fullH, w.height * (w.mobile ? 3 : 2));
    const file = path.join(out, `${p.id}__${w.name}.png`);
    await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width: w.width, height: clipH } });
    const g = {};
    g.overflow_x = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (w.mobile && w.width === 360) {
      g.small_targets = await page.evaluate(smallTargets);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      g.axe_serious = axe.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id} (${v.nodes.length})`);
      g.axe_other = axe.violations.filter(v => !['serious', 'critical'].includes(v.impact)).map(v => `${v.id} (${v.nodes.length})`);
    }
    report.pages[p.id][w.name] = g;
    if (g.overflow_x > 0) report.failures.push(`${p.id}/${w.name}: défilement horizontal +${g.overflow_x}px`);
    if (g.small_targets && g.small_targets.length) report.failures.push(`${p.id}/${w.name}: ${g.small_targets.length} cibles < 44px : ${g.small_targets.slice(0, 6).join(' | ')}`);
    if (g.axe_serious && g.axe_serious.length) report.failures.push(`${p.id}/${w.name}: axe ${g.axe_serious.join(', ')}`);
    await ctx.close();
  }
  // Lisible sans JavaScript : le texte principal doit être présent dans le HTML servi.
  const ctxNoJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 780 } });
  const pg = await ctxNoJs.newPage();
  await pg.goto(url);
  const noJsLen = await pg.evaluate(mainText);
  report.pages[p.id].nojs_main_chars = noJsLen;
  if (noJsLen < 200) report.failures.push(`${p.id}: contenu principal ${noJsLen === -1 ? 'absent' : noJsLen === -2 ? 'masqué' : 'vide'} sans JavaScript (${noJsLen} car.)`);
  await ctxNoJs.close();
}
await browser.close();

// Lighthouse mobile : seuils bloquants, y compris en cas de mesure indisponible.
if (flags.includes('--lighthouse')) {
  let chrome;
  try {
    const { default: lighthouse } = await import('lighthouse');
    const { launch } = await import('chrome-launcher');
    chrome = await launch({
      chromePath: process.env.CHROME || chromium.executablePath(),
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    report.lighthouse = {};
    for (const p of PAGES.filter(p => p.lighthouse)) {
      const r = await lighthouse(base + p.path, { port: chrome.port, output: 'json', logLevel: 'error', formFactor: 'mobile', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
      const c = r.lhr.categories;
      report.lighthouse[p.id] = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v.score === 'number' ? v.score * 100 : null]));
    }
  } catch (err) {
    report.failures.push(`Lighthouse non exécuté : ${err.message}`);
  } finally {
    if (chrome) await chrome.kill();
  }
  report.failures.push(...lighthouseFailures(report.lighthouse, PAGES));
}

report.gates_ok = report.failures.length === 0;
fs.writeFileSync(path.join(out, 'gates.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ gates_ok: report.gates_ok, failures: report.failures, warnings: report.warnings, lighthouse: report.lighthouse }, null, 1));
process.exit(report.gates_ok ? 0 : 1);
