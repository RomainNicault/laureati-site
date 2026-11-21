import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

for (const section of ['vignerons', 'appellations']) {
  test(`formulaire HTML sans JavaScript sur toutes les pages ${section}`, () => {
    for (const slug of readdirSync(`dist/${section}`)) {
      const html = readFileSync(`dist/${section}/${slug}/index.html`, 'utf8');
      assert.match(html, /<details[^>]*id="correction"/);
      assert.match(html, /<form[^>]*method="post"[^>]*action="\/api\/correction"/);
      for (const name of ['page', 'producer_id', 'champ', 'valeur_proposee', 'commentaire', 'contact', 'site_web_2']) assert.ok(html.includes(`name="${name}"`));
      assert.ok(html.includes('data-turnstile-sitekey="0x4AAAAAAF74BfB-5fTJA85N"'));
      assert.ok(html.includes('data-turnstile-status'));
      assert.ok(html.includes('href="/confidentialite/#turnstile"'));
      assert.ok(html.includes('12 mois'));
      assert.ok(html.includes('facultatif, seulement pour vous répondre'));
    }
  });
}
test('pages de retour toujours noindex et sans script exécutable', () => {
  for (const name of ['correction-merci', 'correction-erreur']) {
    const html = readFileSync(`dist/${name}/index.html`, 'utf8');
    assert.match(html, /name="robots" content="noindex"/);
    assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html));
  }
});
