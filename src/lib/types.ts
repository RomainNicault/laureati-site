export interface ProducerAppellation {
  appellation_id: string; couleur: string; rang: number;
  total_vignerons_medailles: number; score: number; top5: boolean;
}
export interface Medal {
  appellation_id: string; concours_id: string; annee: number;
  medaille: string; couleur: string; cuvee?: string;
  /** Libellé public de l'appellation, y compris hors classement. */
  appellation_nom?: string;
}
export interface Producer {
  id: string; id_court: string; nom: string; slug: string; url: string;
  commune?: string; code_postal?: string; adresse?: string;
  latitude?: number; longitude?: number; google_place_id?: string | null; site?: string; telephone?: string;
  vigneron_independant: boolean; score: number;
  /** Groupe ou négociant détenteur d'un domaine vigneron. Absent d'un domaine indépendant. */
  groupe?: string;
  /** Type déduit de la dénomination quand probable = true. Absent d'un export antérieur. */
  type_producteur?: { valeur: string; probable: boolean } | null;
  appellations: ProducerAppellation[]; medailles: Medal[];
}
export interface Ranking {
  couleur: string; ancre: string; total_vignerons_medailles: number;
  vignerons: { producer_id: string; rang: number; score: number }[];
}
export interface Appellation {
  id: string; nom: string; slug: string; regions?: string[];
  couleurs: string[]; couleurs_documentees: string[]; inao_url?: string;
  classements: Ranking[];
}
export interface Region { id: string; nom: string; slug: string; appellations: string[] }
/** Calendrier de parution, tel qu'exporté : mois seulement, source primaire et date de vérification. */
export interface Calendrier {
  mois_debut: number; mois_fin: number; source_url: string; verifie_le: string;
}
export interface Competition {
  id: string; nom: string; url: string; poids: number;
  campagnes_absorbees: number[]; campagnes_score: number[]; derniere_campagne: number | null;
  /** Optionnel : absent d'un export antérieur au calendrier des palmarès. */
  calendrier?: Calendrier;
}
export interface Redirect { ancien_id: string; nouveau_id: string; ancienne_url: string; nouvelle_url: string }
export interface Meta {
  schema_version: string; exporte_le: string; perimetre: string;
  appellations_selectionnees: string[]; fenetre_campagnes: number;
  comptes: { vignerons: number; appellations: number; groupes_classes: number; regions: number; concours: number; medailles: number; redirections: number };
  comptes_globaux: { producteurs_base: number; vignerons_publies: number; appellations_classees: number; groupes_classes: number; redirections_eligibles: number };
}
export interface Dataset {
  producers: Producer[]; appellations: Appellation[]; regions: Region[];
  competitions: Competition[]; redirects: Redirect[]; meta: Meta;
}
export interface Breadcrumb { name: string; path: string }
