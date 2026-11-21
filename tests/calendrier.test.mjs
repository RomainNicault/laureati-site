import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { calendrierSchema, concoursExporte } from '../src/lib/calendrier.ts';
import { calendrierPalmares, libelleMois, MOIS_NON_RENSEIGNE, plageCalendrier } from '../src/lib/concours.ts';
import { loadData } from '../src/lib/data.ts';

const calendrier = { mois_debut: 2, mois_fin: 2, source_url: 'https://example.org/palmares/', verifie_le: '2026-11-16' };
const concours = (id, nom, champ) => ({
  id, nom, url: 'https://example.org/palmares/', poids: 1,
  campagnes_absorbees: [2025, 2026], campagnes_score: [2025, 2026], derniere_campagne: 2026,
  ...(champ === undefined ? {} : { calendrier: champ }),
});

test('le libellé vient du calendrier : un mois seul ou une plage', () => {
  assert.equal(libelleMois(calendrier), 'février');
  assert.equal(libelleMois({ ...calendrier, mois_debut: 2, mois_fin: 3 }), 'février à mars');
  assert.equal(libelleMois({ ...calendrier, mois_debut: 12, mois_fin: 12 }), 'décembre');
  assert.equal(libelleMois({ ...calendrier, mois_debut: 4, mois_fin: 5 }), 'avril à mai');
});

test('sans calendrier, libellé neutre et aucun crash', () => {
  assert.equal(libelleMois(undefined), MOIS_NON_RENSEIGNE);
  const dataset = { competitions: [concours('Ligers', 'Ligers'), concours('CGA', 'CGA', calendrier)] };
  const reperes = calendrierPalmares(dataset);
  assert.deepEqual(reperes.map(repere => repere.mois), ['février', 'mois non renseigné']);
  assert.equal(plageCalendrier({ competitions: [concours('Ligers', 'Ligers')] }), null);
  assert.deepEqual(plageCalendrier({ competitions: [concours('CGA', 'CGA', { ...calendrier, mois_fin: 3 })] }),
    { debut: 'février', fin: 'mars' });
});

test('les repères suivent l’ordre de parution, pas l’ordre de l’export', () => {
  const dataset = { competitions: [
    concours('Mâcon', 'Mâcon', { ...calendrier, mois_debut: 4, mois_fin: 4 }),
    concours('Ligers', 'Ligers', calendrier),
    concours('Bordeaux', 'Bordeaux', { ...calendrier, mois_debut: 4, mois_fin: 4 }),
  ] };
  assert.deepEqual(calendrierPalmares(dataset).map(repere => repere.competition.id), ['Ligers', 'Bordeaux', 'Mâcon']);
});

test('le calendrier optionnel est validé : mois 1-12, ordre croissant, source et date', () => {
  assert.deepEqual(calendrierSchema.parse(calendrier), calendrier);
  assert.equal(concoursExporte(concours('Ligers', 'Ligers'), 0).calendrier, undefined);
  assert.throws(() => concoursExporte(concours('Ligers', 'Ligers', { ...calendrier, mois_debut: 0 }), 0), /calendrier invalide/);
  assert.throws(() => concoursExporte(concours('Ligers', 'Ligers', { ...calendrier, mois_fin: 13 }), 0), /mois_de_fin|mois_fin/);
  assert.throws(() => concoursExporte(concours('Ligers', 'Ligers', { ...calendrier, mois_fin: 1 }), 3), /passage d’année/, 'plage inversée refusée');
  assert.throws(() => concoursExporte(concours('Ligers', 'Ligers', { ...calendrier, source_url: 'http://example.org/' }), 0), /URL https/);
  assert.throws(() => concoursExporte(concours('Ligers', 'Ligers', { ...calendrier, verifie_le: '2026-02-31' }), 0), /date inexistante/);
  assert.throws(() => concoursExporte(concours('Ligers', 'Ligers', { ...calendrier, verifie_le: '16/11/2026' }), 0), /AAAA-MM-JJ/);
  assert.throws(() => concoursExporte(concours('Ligers', 'Ligers', { ...calendrier, mois_debut: 2.5 }), 0), /mois entier de 1 à 12/);
});

test('le message d’erreur nomme le concours et sa position dans l’export', () => {
  assert.throws(() => concoursExporte(concours('CVI', 'CVI', { ...calendrier, mois_fin: 1 }), 4),
    /competitions\[4\] \(CVI\) : calendrier invalide/);
});

test('seules les quatre clés publiées sont lues, sans donnée privée', () => {
  const enrichi = { ...calendrier, note: 'note privée du producteur', verifie_par: 'interne' };
  const resultat = concoursExporte(concours('Ligers', 'Ligers', enrichi), 0);
  assert.deepEqual(Object.keys(resultat.calendrier).sort(),
    ['mois_debut', 'mois_fin', 'source_url', 'verifie_le']);
  assert.equal(JSON.stringify(resultat).includes('note privée'), false);
  assert.equal(resultat.calendrier.mois_debut, 2);
});

test('un export au calendrier invalide arrête le chargement, donc le build', () => {
  const root = mkdtempSync(join(process.cwd(), '.data-test-calendrier-'));
  try {
    const directory = join(root, 'sample');
    mkdirSync(directory, { recursive: true });
    const fichiers = {
      producers: [], appellations: [], regions: [], redirects: [], meta: {},
      competitions: [{ ...concours('CVI', 'CVI'), calendrier: { ...calendrier, mois_fin: 1 } }],
    };
    for (const [file, valeur] of Object.entries(fichiers)) {
      writeFileSync(join(directory, `${file}.json`), JSON.stringify(valeur));
    }
    assert.throws(() => loadData(root), /competitions\[0\] \(CVI\) : calendrier invalide/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('l’export publié dans le dépôt reste lisible, avec ou sans calendrier', () => {
  const competitions = loadData().competitions;
  assert.ok(competitions.length > 0, 'concours chargés');
  for (const competition of competitions) {
    assert.ok(competition.calendrier === undefined || (competition.calendrier.mois_debut >= 1
      && competition.calendrier.mois_fin <= 12), competition.id);
  }
});
