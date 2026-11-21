import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { remarkGardeEditoriale } from './src/lib/markdown-guard.mjs';

export default defineConfig({
  site: 'https://laureati.fr',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Tout Markdown du site (collections textes comprises) passe par la garde remark :
  // HTML brut, image ou lien hors https://, / et # font échouer le build.
  // Astro 7 : remarkPlugins se déclare sur le processeur unified (l'ancienne clé
  // markdown.remarkPlugins y est repliée avec un avertissement de dépréciation).
  markdown: { processor: unified({ remarkPlugins: [remarkGardeEditoriale] }) },
  // Les pages noindex restent hors du plan de site.
  integrations: [sitemap({ filter: (page) => !/\/(styleguide|correction-merci|correction-erreur)\/$/.test(page) })],
});
