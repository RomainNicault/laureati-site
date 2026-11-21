// Contrôles exécutés dans la page (passés tels quels à page.evaluate) : aucune fermeture, aucun import.

// Cibles tactiles visibles de moins de 44 px en largeur ou en hauteur.
// Surface prise en compte : le contrôle, ou son label cliquable s'il est plus grand.
// Exemptions : éléments invisibles (display, visibility, opacité), liens dans un paragraphe,
// aires d'une carte SVG masquée aux aides techniques et hors tabulation dont la destination
// existe aussi en cible conforme hors carte (critère WCAG 2.5.8, « équivalent »).
export function smallTargets() {
  const VIS = { checkOpacity: true, checkVisibilityCSS: true };
  const bad = [];
  const large = el => { const b = el.getBoundingClientRect(); return el.checkVisibility(VIS) && b.width >= 43.5 && b.height >= 43.5; };
  const equivalent = el => el.closest('svg[aria-hidden="true"]') && el.getAttribute('tabindex') === '-1'
    && [...document.querySelectorAll('a[href]')].some(other => !other.closest('svg') && other.getAttribute('href') === el.getAttribute('href') && large(other));
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, summary, [role=button]')) {
    if (!el.checkVisibility(VIS)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (getComputedStyle(el).display === 'inline' && el.closest('p, li p, .prose')) continue;
    if (equivalent(el)) continue;
    let w = r.width, h = r.height;
    for (const lab of el.labels || []) {
      if (!lab.checkVisibility(VIS)) continue;
      const l = lab.getBoundingClientRect();
      w = Math.max(w, l.width); h = Math.max(h, l.height);
    }
    if (h < 43.5 || w < 43.5) bad.push(((el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40)) + ` ${Math.round(w)}x${Math.round(h)}`);
  }
  return bad;
}

// Texte du <main> réellement visible : -1 absent, -2 invisible (display, visibility, opacité, boîte nulle).
// Pas de repli sur <body> : en-tête et pied ne masquent pas la disparition du contenu.
export function mainText() {
  const m = document.querySelector('main');
  if (!m) return -1;
  const r = m.getBoundingClientRect();
  if (!m.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || r.width === 0 || r.height === 0) return -2;
  return m.innerText.trim().length;
}
