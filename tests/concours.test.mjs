import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { dataset, producersById, appellationsById } from '../src/lib/data.ts';
import {

  baremes, calendrierPalmares, coefficient, coefficientLabel, contributions, contributionScore,
  competitionKey, competitionPath, exempleCalcul,
} from '../src/lib/concours.ts';
import { formatScore } from '../src/lib/site.ts';

const page = (path) => readFileSync(join('dist', path, 'index.html'), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/** Contenu de la première balise ouvrante qui porte la classe donnée, jusqu'à sa fermeture. */
const block = (html, tag, cls) => {
  const match = html.match(new RegExp(`<${tag}[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`));
  return match?.[1] ?? null;
};

test('l’index des concours mène à chaque page et à ses palmarès', () => {
  const html = page('/concours/');
  const grid = block(html, 'ul', 'concours-grid');
  assert.ok(grid, 'liste des concours');
  assert.equal((grid.match(/<li[\s>]/g) ?? []).length, dataset.competitions.length, 'un élément par concours');
  for (const competition of dataset.competitions) {
    assert.ok(grid.includes(`href="${competitionPath(competition)}"`), competition.id);
  }
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
});

test('chaque page concours relie barème, campagnes et palmarès officiel', () => {
  const scales = baremes(dataset);
  for (const competition of dataset.competitions) {
    const path = competitionPath(competition);
    const html = page(path);
    assert.ok(html.includes(competition.nom), competition.id);
    assert.ok(html.includes(competition.url), competition.id);
    assert.ok(html.includes(`/concours/`), competition.id);
    for (const annee of competition.campagnes_absorbees) {
      assert.ok(html.includes(`${path}${annee}/`), `${competition.id} ${annee}`);
    }
    for (const level of scales.get(competition.id)) {
      assert.ok(text(html).includes(`${level.label} ${level.points} point`), `${competition.id} ${level.label}`);
    }
    assert.match(html, /BreadcrumbList/);
  }
});

test('les palmarès annuels ne listent que les médailles du corpus, avec leurs liens', () => {
  for (const competition of dataset.competitions) {
    for (const annee of competition.campagnes_absorbees) {
      const html = page(`${competitionPath(competition)}${annee}/`);
      const expected = dataset.producers.flatMap(producer => producer.medailles
        .filter(medal => medal.concours_id === competition.id && medal.annee === annee));
      assert.equal((html.match(/class="medal /g) ?? []).length, expected.length, `${competition.id} ${annee}`);
      const warning = html.match(/<p[^>]*class="palmares-warning"[^>]*>([\s\S]*?)<\/p>/);
      assert.ok(warning, `${competition.id} ${annee} : avertissement de corpus partiel`);
      assert.match(warning[0], /role="note"/, 'avertissement exposé comme note');
      assert.ok(warning[1].includes(`href="${competition.url}"`), 'avertissement relié au palmarès officiel');
      assert.ok(html.includes(competition.url), `${competition.id} ${annee}`);
      assert.match(html, /BreadcrumbList/);
      const producers = new Set(expected.map(medal => dataset.producers.find(producer => producer.medailles.includes(medal))));
      for (const producer of producers) assert.ok(html.includes(`href="${producer.url}"`), producer.url);
      const groups = new Map();
      for (const medal of expected) {
        const appellation = appellationsById.get(medal.appellation_id);
        if (!appellation) continue;
        const ranking = appellation.classements.find(group => group.couleur === medal.couleur);
        groups.set(`${appellation.slug}|${ranking?.ancre ?? ''}`, { appellation, ranking });
      }
      for (const { appellation, ranking } of groups.values()) {
        const href = `/appellations/${appellation.slug}/${ranking ? `#${ranking.ancre}` : ''}`;
        assert.ok(html.includes(`href="${href}"`), `${competition.id} ${annee} ${href}`);
      }
    }
  }
});

test('le score de chaque rang se recalcule depuis les médailles et le barème', () => {
  const scales = baremes(dataset);
  for (const appellation of dataset.appellations) {
    for (const group of appellation.classements) {
      for (const entry of group.vignerons) {
        const producer = producersById.get(entry.producer_id);
        assert.ok(producer, entry.producer_id);
        const items = dataset.competitions.flatMap(competition =>
          contributions(producer, appellation.id, group.couleur, competition, scales.get(competition.id)));
        assert.ok(Math.abs(contributionScore(items) - entry.score) < 0.05,
          `${appellation.slug} ${group.couleur} rang ${entry.rang} : ${contributionScore(items)} au lieu de ${entry.score}`);
      }
    }
  }
});

test('les coefficients de récence s’écrivent sans ambiguïté', () => {
  for (const competition of dataset.competitions) {
    const campaigns = [...competition.campagnes_score].sort((a, b) => b - a);
    assert.equal(coefficientLabel(competition, campaigns[0]), '1');
    if (campaigns[1] !== undefined) assert.equal(coefficientLabel(competition, campaigns[1]), '2/3');
    if (campaigns[2] !== undefined) assert.equal(coefficientLabel(competition, campaigns[2]), '1/3');
  }
});

test('le coefficient suit la règle publiée même avec moins de trois campagnes', () => {
  const deux = { id: 'concours:essai', nom: 'Essai', url: 'https://example.org/', poids: 1,
    campagnes_absorbees: [2025, 2026], campagnes_score: [2025, 2026], derniere_campagne: 2026 };
  assert.equal(coefficient(deux, 2026), 1);
  assert.equal(coefficient(deux, 2025), 2 / 3);
  assert.equal(coefficientLabel(deux, 2025), '2/3');
  assert.equal(coefficient(deux, 2024), 0);
  const quatre = { ...deux, campagnes_score: [2023, 2024, 2025, 2026] };
  assert.equal(coefficient(quatre, 2024), 1 / 3);
  assert.equal(coefficient(quatre, 2023), 0, 'hors des trois dernières campagnes');
});

test('la contribution multiplie le poids du concours', () => {
  const competition = { id: 'concours:essai', nom: 'Essai', url: 'https://example.org/', poids: 1.5,
    campagnes_absorbees: [2024, 2025, 2026], campagnes_score: [2024, 2025, 2026], derniere_campagne: 2026 };
  const producer = { id: 'p', medailles: [
    { concours_id: 'concours:essai', appellation_id: 'a', couleur: 'Rouge', annee: 2025, medaille: 'Or' },
  ] };
  const [item] = contributions(producer, 'a', 'Rouge', competition, [{ label: 'Or', points: 3 }]);
  assert.equal(item.poids, 1.5);
  assert.ok(Math.abs(item.score - 1.5 * (2 / 3) * 3) < 1e-9);
});

test('la méthodologie relie les concours, date les palmarès et donne un exemple recalculable', () => {
  const html = page('/methodologie/');
  for (const competition of dataset.competitions) assert.ok(html.includes(competitionPath(competition)), competition.id);
  const calendar = block(html, 'ol', 'calendar');
  assert.ok(calendar, 'calendrier des palmarès');
  const items = [...calendar.matchAll(/<li[^>]*data-concours="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
  assert.deepEqual(items.map(item => item[1]).sort(), dataset.competitions.map(c => competitionKey(c.id)).sort(),
    'un repère par concours suivi');
  assert.equal(calendarItems(calendar), dataset.competitions.length);
  for (const [, , body] of items) {
    const mois = body.match(/<span>([^<]*)<\/span>/)?.[1] ?? '';
    assert.match(mois, /^[\p{Ll} ]+$/u, `mois seuls, sans date au jour près : ${mois}`);
  }
  assert.equal(calendrierPalmares(dataset).length, dataset.competitions.length);

  const exemple = exempleCalcul(dataset);
  assert.ok(exemple, 'un exemple réel existe');
  assert.ok(new Set(exemple.contributions.map(item => item.coefficient)).size >= 2, 'au moins deux coefficients');
  const calcul = block(html, 'ul', 'calcul');
  assert.ok(calcul, 'liste du calcul');
  assert.equal((calcul.match(/<li[\s>]/g) ?? []).length, exemple.contributions.length, 'une ligne par contribution');
  for (const item of exemple.contributions) {
    assert.ok(text(calcul).includes(`poids ${item.poids} × ${coefficientLabel(item.competition, item.annee)} × ${item.points} point`),
      `${item.competition.id} ${item.annee}`);
  }
  assert.ok(text(html).includes(exemple.producer.nom));
  assert.ok(text(html).includes(formatScore(exemple.score)));
  assert.ok(new RegExp(`rang ${exemple.rang}\\b[^<]*${exemple.total}`).test(text(html)), 'rang et effectif');
});

const calendarItems = (calendar) => (calendar.match(/<li[\s>]/g) ?? []).length;

test('le plan de site contient les nouvelles pages', () => {
  const sitemap = readFileSync('dist/sitemap-0.xml', 'utf8');
  assert.ok(sitemap.includes('https://laureati.fr/concours/'));
  for (const competition of dataset.competitions) {
    assert.ok(sitemap.includes(`https://laureati.fr${competitionPath(competition)}`));
    for (const annee of competition.campagnes_absorbees) {
      assert.ok(sitemap.includes(`https://laureati.fr${competitionPath(competition)}${annee}/`));
    }
  }
});

test('les adresses de concours sont stables et sans accent', () => {
  assert.equal(competitionKey('concours:fictif'), 'fictif');
  assert.equal(competitionKey('Mâcon'), 'macon');
  assert.equal(competitionKey('Sud-Ouest'), 'sud-ouest');
  assert.equal(competitionKey('CGA'), 'cga');
});
