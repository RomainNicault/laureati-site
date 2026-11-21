// Lancement public E4 : indexable sur laureati.fr. Les hôtes *.workers.dev
// reçoivent X-Robots-Tag: noindex par public/_headers (prévisualisations comprises).
export const INDEXABLE = true;
export const SITE_URL = 'https://laureati.fr';
export const SITE_NAME = 'Laureati';
// Clé publique du widget Turnstile « laureati-site ». Une clé de test Cloudflare
// peut la remplacer au build avec PUBLIC_TURNSTILE_SITE_KEY (prévisualisation).
export const TURNSTILE_SITE_KEY = '0x4AAAAAAF74BfB-5fTJA85N';
export const colorAnchor = (color: string): string => color.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const scoreFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const formatScore = (score: number): string => scoreFormatter.format(score);
export const safeWebsite = (url?: string): string | undefined => url && /^https?:\/\//i.test(url) ? url : undefined;
