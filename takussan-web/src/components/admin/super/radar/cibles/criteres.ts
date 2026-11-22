import { ApiError } from '@/lib/api';
import type { Formatteurs } from '@/lib/format/useFormatteurs';
import type { RadarContract, RadarSourceSite, RadarTargetCriteria, RadarTargetNeighborhood } from '@/types/radar';

/**
 * TCK-2469 (ADR-0087 §5) — les critères d'une cible, côté console : le brouillon du formulaire, sa conversion vers la
 * forme de l'API, et le résumé lisible (« Appartement · location · Almadies, Ngor · 300 000 – 700 000 F CFA · 2-3 ch. »).
 * Rien n'est jugé ici : l'API (`RadarTargetCriteria`) est le seul juge, et son refus se lit par son code.
 */

/** Une fonction de traduction, telle que la rend `useTranslations` (valeurs interpolées comprises). */
export type Traduire = (cle: string, valeurs?: Record<string, string | number>) => string;

/** Le formulaire : les nombres restent du texte tant qu'ils sont saisis. */
export interface BrouillonCriteres {
  readonly cities: readonly string[];
  readonly neighborhoods: readonly RadarTargetNeighborhood[];
  readonly types: readonly string[];
  readonly contract: RadarContract | null;
  readonly priceMin: string;
  readonly priceMax: string;
  readonly bedroomsMin: string;
  readonly bedroomsMax: string;
  readonly furnished: boolean | null;
  readonly sites: readonly RadarSourceSite[];
  readonly maxAgeDays: string;
}

export const BROUILLON_VIDE: BrouillonCriteres = {
  cities: [],
  neighborhoods: [],
  types: [],
  contract: null,
  priceMin: '',
  priceMax: '',
  bedroomsMin: '',
  bedroomsMax: '',
  furnished: null,
  sites: [],
  maxAgeDays: '',
};

const texteDe = (valeur: number | null): string => (valeur === null ? '' : String(valeur));

export function brouillonDe(criteres: RadarTargetCriteria): BrouillonCriteres {
  return {
    cities: criteres.cities,
    neighborhoods: criteres.neighborhoods,
    types: criteres.types,
    contract: criteres.contract,
    priceMin: texteDe(criteres.price_min),
    priceMax: texteDe(criteres.price_max),
    bedroomsMin: texteDe(criteres.bedrooms_min),
    bedroomsMax: texteDe(criteres.bedrooms_max),
    furnished: criteres.furnished,
    sites: criteres.sites,
    maxAgeDays: texteDe(criteres.max_age_days),
  };
}

/**
 * Un nombre saisi : les chiffres seuls (espaces de milliers tolérés), ou `null` pour un champ vide. Une saisie qui n'est
 * pas un entier part TELLE QUELLE : l'API la refuse par `radar.targets.invalid_criteria`, qui nomme le champ — mieux
 * qu'un critère effacé sans un mot.
 */
export function nombreSaisi(texte: string): number | string | null {
  const net = texte.replace(/[\s  ]/g, '');
  if (net === '') return null;
  return /^\d{1,15}$/.test(net) ? Number(net) : net;
}

/** Le corps `criteria` envoyé à l'API, toutes clés présentes. */
export function criteresDe(brouillon: BrouillonCriteres): RadarTargetCriteria {
  return {
    cities: [...brouillon.cities],
    neighborhoods: brouillon.neighborhoods.map((n) => ({ name: n.name, city: n.city })),
    types: [...brouillon.types],
    contract: brouillon.contract,
    // Une saisie non entière part en chaîne (cf. `nombreSaisi`) : le type de l'API l'accepte en entrée.
    price_min: nombreSaisi(brouillon.priceMin) as number | null,
    price_max: nombreSaisi(brouillon.priceMax) as number | null,
    bedrooms_min: nombreSaisi(brouillon.bedroomsMin) as number | null,
    bedrooms_max: nombreSaisi(brouillon.bedroomsMax) as number | null,
    furnished: brouillon.furnished,
    sites: [...brouillon.sites],
    max_age_days: nombreSaisi(brouillon.maxAgeDays) as number | null,
  };
}

/** Deux jeux de critères égaux, à l'ordre des listes près — pour n'envoyer `criteria` que s'il a changé. */
export function memesCriteres(a: RadarTargetCriteria, b: RadarTargetCriteria): boolean {
  const forme = (c: RadarTargetCriteria) => JSON.stringify({
    ...c,
    cities: [...c.cities].sort(),
    neighborhoods: c.neighborhoods.map((n) => `${n.name}|${n.city ?? ''}`).sort(),
    types: [...c.types].sort(),
    sites: [...c.sites].sort(),
  });
  return forme(a) === forme(b);
}

interface OutilsDuResume {
  /** `superAdmin.pages.radar.targets` */
  readonly t: Traduire;
  /** `property.types` */
  readonly tTypes: Traduire;
  /** `superAdmin.pages.radar.sites` */
  readonly tSites: Traduire;
  readonly fmt: Formatteurs;
}

const estNombre = (valeur: unknown): valeur is number => typeof valeur === 'number' && Number.isFinite(valeur);

function fourchette(
  min: unknown,
  max: unknown,
  t: Traduire,
  prefixe: 'price' | 'bedrooms',
  rendre: (valeur: number) => string,
): string | null {
  const bas = estNombre(min) ? min : null;
  const haut = estNombre(max) ? max : null;
  if (bas !== null && haut !== null) {
    return bas === haut
      ? t(`summary.${prefixe}Exact`, { value: rendre(bas) })
      : t(`summary.${prefixe}Range`, { min: rendre(bas), max: rendre(haut) });
  }
  if (bas !== null) return t(`summary.${prefixe}Min`, { min: rendre(bas) });
  if (haut !== null) return t(`summary.${prefixe}Max`, { max: rendre(haut) });
  return null;
}

/**
 * Les morceaux du résumé, dans l'ordre où l'on décrit un bien : quoi, pour quoi, où, combien, quelle taille, puis les
 * restrictions. Vide : aucun critère (l'API le refuserait).
 */
export function morceauxDuResume(criteres: RadarTargetCriteria, { t, tTypes, tSites, fmt }: OutilsDuResume): string[] {
  const morceaux: string[] = [];
  if (criteres.types.length > 0) morceaux.push(criteres.types.map((type) => tTypes(type)).join(', '));
  if (criteres.contract) morceaux.push(t(`summary.contract.${criteres.contract}`));
  if (criteres.neighborhoods.length > 0) morceaux.push(criteres.neighborhoods.map((n) => n.name).join(', '));
  if (criteres.cities.length > 0) morceaux.push(criteres.cities.join(', '));
  const prix = fourchette(criteres.price_min, criteres.price_max, t, 'price', (v) => fmt.montant(v, 'XOF'));
  if (prix) morceaux.push(prix);
  const chambres = fourchette(criteres.bedrooms_min, criteres.bedrooms_max, t, 'bedrooms', (v) => fmt.nombre(v));
  if (chambres) morceaux.push(chambres);
  if (criteres.furnished !== null) morceaux.push(t(criteres.furnished ? 'summary.furnished' : 'summary.unfurnished'));
  if (criteres.sites.length > 0) morceaux.push(criteres.sites.map((site) => tSites(site)).join(', '));
  if (estNombre(criteres.max_age_days)) morceaux.push(t('summary.maxAge', { days: criteres.max_age_days }));
  return morceaux;
}

export const SEPARATEUR_DU_RESUME = ' · ';

// ─── Les refus ────────────────────────────────────────────────────────────────────────────────

/** Les paramètres d'un refus codé (`params`). */
export function parametresDuRefus(erreur: unknown): Record<string, unknown> {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return {};
  const params = (erreur.data as { params?: unknown }).params;
  return params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
}

/** Les clés de critère que le formulaire nomme (`targets.fields.*`). */
export const CLES_DE_CRITERE = [
  'cities', 'neighborhoods', 'types', 'contract', 'price_min', 'price_max', 'bedrooms_min', 'bedrooms_max',
  'furnished', 'sites', 'max_age_days',
] as const;

export type CleDeCritere = (typeof CLES_DE_CRITERE)[number];

/** `criteria.neighborhoods.1.name` → `neighborhoods` ; `null` si le chemin ne nomme aucun critère connu. */
export function critereDuChamp(champ: unknown): CleDeCritere | null {
  if (typeof champ !== 'string') return null;
  const cle = /^criteria\.([a-z_]+)/.exec(champ)?.[1];
  return (CLES_DE_CRITERE as readonly string[]).includes(cle ?? '') ? (cle as CleDeCritere) : null;
}
