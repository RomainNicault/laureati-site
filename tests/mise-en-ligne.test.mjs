import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

test('les hôtes workers.dev restent noindex, laureati.fr non', () => {
  const headers = read('dist/_headers');
  assert.match(headers, /^https:\/\/:worker\.:subdomain\.workers\.dev\/\*\n\s+X-Robots-Tag: noindex$/m);
  assert.doesNotMatch(headers.split('\n').filter(line => !line.startsWith('#')).join('\n'), /laureati\.fr/);
});

test('robots.txt autorise tous les robots et annonce le plan de site canonique', () => {
  const robots = read('dist/robots.txt');
  assert.match(robots, /^User-agent: \*\nAllow: \/$/m);
  assert.doesNotMatch(robots, /Disallow/);
  assert.match(robots, /^Sitemap: https:\/\/laureati\.fr\/sitemap-index\.xml$/m);
  assert.match(read('dist/llms.txt'), /https:\/\/laureati\.fr\/confidentialite\//);
});

test('le plan de site est canonique et exclut les pages noindex', () => {
  const sitemap = read('dist/sitemap-0.xml');
  assert.match(sitemap, /<loc>https:\/\/laureati\.fr\/mentions-legales\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/laureati\.fr\/confidentialite\/<\/loc>/);
  assert.doesNotMatch(sitemap, /styleguide|correction-merci|correction-erreur/);
  assert.doesNotMatch(sitemap, /workers\.dev/);
});

test('les pages légales sont complètes, liées au pied de page et sans tiret long', () => {
  const mentions = read('dist/mentions-legales/index.html');
  const confidentialite = read('dist/confidentialite/index.html');
  for (const expected of ['contact@laureati.fr', 'Cloudflare, Inc.', '101 Townsend St', 'Romain Nicault', 'Droit de réponse', 'site indépendant', 'aucun visuel officiel de médaille', 'Licence Ouverte 1.0', 'DRAAF', 'Google Places', 'place_id']) assert.ok(mentions.includes(expected), expected);
  // Code sous MIT, lien vers le dépôt ; textes, visuels et données réservés ; retrait sous 7 jours pour un concours.
  for (const expected of ['licence MIT (Massachusetts Institute of Technology)', 'href="https://github.com/RomainNicault/laureati-site"', 'Cette licence couvre le code seul.', 'restent réservés', 'retirés du site sous 7 jours']) assert.ok(mentions.includes(expected), expected);
  assert.doesNotMatch(mentions, /la mise en page et le code du site sont des créations originales/);
  // Google n’apparaît que comme source de l’identifiant de lieu (place_id).
  assert.doesNotMatch(mentions.replaceAll('Google Places', ''), /Google/);
  assert.doesNotMatch(mentions, /publie seulement les coordonnées/);
  assert.doesNotMatch(read('dist/methodologie/index.html'), /en préparation/);
  // Édition non professionnelle : aucune adresse personnelle ni identifiant d’entreprise publiés.
  // Motifs génériques : le seul code postal admis est celui de l’hébergeur (San Francisco).
  for (const page of [mentions, confidentialite]) {
    const visible = text(page);
    assert.doesNotMatch(visible, /SIRE[NT] ?:|\b\d{3} ?\d{3} ?\d{3}(?: ?\d{5})?\b/);
    assert.deepEqual([...visible.matchAll(/\b\d{5}\b/g)].map(m => m[0]).filter(code => code !== '94107'), []);
    assert.doesNotMatch(visible.replace('101 Townsend St', ''), /\b\d+,? (?:bis |ter )?(?:rue|avenue|av\.|boulevard|bd|place|allée|chemin|impasse|quai|cours)\b/i);
  }
  assert.match(read('dist/404.html'), /<meta name="robots" content="noindex"/);
  for (const field of ['page concernée', 'champ à corriger', 'valeur proposée', 'commentaire', 'contact', 'date et l’heure', 'empreinte de votre adresse IP', 'statut']) {
    assert.ok(confidentialite.includes(field), field);
  }
  // Destinataires des fiches : public, Cloudflare, GitHub (dépôt privé, jamais dit public) ; retrait sous 7 jours.
  for (const expected of ['le public, qui consulte les pages du site', 'Cloudflare, Inc., qui héberge le site', 'GitHub, Inc.', 'dépôt privé', 'acceptée sans justification et appliquée sous 7 jours']) {
    assert.ok(confidentialite.includes(expected), expected);
  }
  assert.doesNotMatch(text(confidentialite), /dépôt public|dépôt GitHub public/);
  for (const expected of ['aucun cookie', 'score et un rang', 'sans condition', 'place_id', '12 mois', 'Cloudflare D1', 'CNIL (Commission nationale', 'intérêt légitime', 'RGPD', 'Turnstile', 'pré-autorisation', 'signaux']) {
    assert.ok(confidentialite.includes(expected), expected);
  }
  for (const page of [mentions, confidentialite]) {
    assert.doesNotMatch(text(page), /[\u2013\u2014]/);
    assert.match(page, /href="\/mentions-legales\/"/);
    assert.match(page, /href="\/confidentialite\/"/);
  }
});
