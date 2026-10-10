import { apiFetch } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { propertyTypeValues } from '@/lib/schemas/property';
import { HOMEPAGE_DISCOVERY_PER_ROW } from '@/lib/rangees-de-l-accueil';
import { FRAICHEUR_DOMAINE_VILLES, SEUIL_QUARTIER_INDEXABLE } from '@/lib/queries/facettes';
import { rechercherBiensPublics } from '@/lib/queries/public-search';
import type { PropertyListItem } from '@/types/property';

/**
 * Les sections de l'accueil ajoutées par TCK-628 — **chacune lue sur un endpoint qui existe déjà**,
 * aucun n'a été créé pour elles :
 *
 * | section | endpoint | ce qu'il rend |
 * |---|---|---|
 * | « À vendre » | `GET /public/properties/search?contract_type=sale` | la recherche publique, filtrée |
 * | « Explorer par ville » | `GET /public/properties/cities` | les villes du catalogue public, avec leur compte |
 * | « Par type de bien » | `GET /public/property-types` | les 16 types, avec leur compte |
 * | « Quartiers prisés » | `GET /public/properties/neighborhoods?city=` | les quartiers d'une ville, avec leur compte |
 *
 * Les trois derniers sont les DOMAINES des facettes canoniques (TCK-433, TCK-598), déjà demandés
 * par `/properties` et le sitemap, avec les MÊMES options : un appel partagé, en cache de données
 * une heure. L'accueil n'en paie donc pas un de plus par visiteur.
 *
 * ⚠ **Chaque section rend `null` en cas de panne, indépendamment des autres**, et la section
 * disparaît alors de la page : c'est le contrat de `decouverteDeLAccueil` (une page publique doit
 * rester servable), appliqué section par section. Le client ne relance aucune de ces requêtes —
 * elles ne dépendent pas de la ville devinée, et un lien de raccourci n'a pas à apparaître après
 * coup sous les yeux du visiteur.
 *
 * ⚠ **Les réponses sont lues défensivement** (`Array.isArray`, comptes numériques) : un domaine
 * mal formé doit faire disparaître une section, jamais faire tomber l'accueil.
 */

/** Une valeur de facette et le nombre de biens publics qui la portent. */
export interface Comptage {
  readonly valeur: string;
  readonly compte: number;
}

export interface RaccourcisDeLAccueil {
  readonly vente: readonly PropertyListItem[] | null;
  readonly villes: readonly Comptage[] | null;
  readonly types: readonly Comptage[] | null;
  readonly quartiers: { readonly ville: string; readonly items: readonly Comptage[] } | null;
}

export const AUCUN_RACCOURCI: RaccourcisDeLAccueil = { vente: null, villes: null, types: null, quartiers: null };

/** Assez pour deux lignes de tuiles au bureau, et pas une liste exhaustive. */
const MAX_VILLES = 12;
const MAX_TYPES = 12;
const MAX_QUARTIERS = 16;

const EN_CACHE_PARTAGE = { next: { revalidate: FRAICHEUR_DOMAINE_VILLES } } as RequestInit;

/** `{ value, count }[]` → comptages valides, du plus fourni au moins fourni, `null` si vide. */
function comptages(
  brut: unknown,
  { max, min = 1, garde = () => true }: { max: number; min?: number; garde?: (valeur: string) => boolean },
): readonly Comptage[] | null {
  if (!Array.isArray(brut)) return null;
  const valides = brut
    .filter(
      (l): l is { value: string; count: number } =>
        typeof l?.value === 'string' && l.value.trim() !== '' && typeof l?.count === 'number' && l.count >= min,
    )
    .filter((l) => garde(l.value))
    .map((l) => ({ valeur: l.value.trim(), compte: l.count }))
    .sort((a, b) => b.compte - a.compte)
    .slice(0, max);
  return valides.length > 0 ? valides : null;
}

async function lire<T>(etiquette: string, appel: () => Promise<T>): Promise<T | null> {
  try {
    return await appel();
  } catch (err: unknown) {
    // Au journal SERVEUR : utile au développeur, jamais au visiteur (principe non négociable n°5).
    console.error(`[accueil] ${etiquette} indisponible : `, err);
    return null;
  }
}

async function biensAVendre(locale: string): Promise<readonly PropertyListItem[] | null> {
  // `rechercherBiensPublics` rend déjà `null` en cas de panne, et journalise.
  const resultat = await rechercherBiensPublics(
    `contract_type=sale&per_page=${HOMEPAGE_DISCOVERY_PER_ROW}`,
    locale,
  );
  const biens = resultat?.data;
  return Array.isArray(biens) && biens.length > 0 ? biens : null;
}

async function villes(): Promise<readonly Comptage[] | null> {
  const reponse = await lire('/public/properties/cities', () =>
    apiFetch<{ data?: unknown }>('/public/properties/cities', EN_CACHE_PARTAGE, {
      locale: DEFAULT_LOCALE,
      partage: true,
    }),
  );
  return comptages(reponse?.data, { max: MAX_VILLES });
}

async function types(): Promise<readonly Comptage[] | null> {
  const connus = new Set<string>(propertyTypeValues);
  const reponse = await lire('/public/property-types', () =>
    apiFetch<{ data?: unknown }>('/public/property-types', EN_CACHE_PARTAGE, {
      locale: DEFAULT_LOCALE,
      partage: true,
    }),
  );
  // Un type que le front ne sait pas nommer n'a pas de tuile : il afficherait une clé brute.
  return comptages(reponse?.data, { max: MAX_TYPES, garde: (v) => connus.has(v) });
}

async function quartiers(ville: string): Promise<RaccourcisDeLAccueil['quartiers']> {
  const reponse = await lire(`/public/properties/neighborhoods?city=${ville}`, () =>
    apiFetch<{ data?: unknown }>(
      cheminApi`/public/properties/neighborhoods?city=${encodeURIComponent(ville)}`,
      EN_CACHE_PARTAGE,
      { locale: DEFAULT_LOCALE, partage: true },
    ),
  );
  // Seuls les quartiers INDEXABLES (TCK-598) : sous le seuil, `?city=…&location=…` se replie sur la
  // page de la ville — un raccourci y mènerait vers une page qui ne dit pas ce qu'il annonce.
  const items = comptages(reponse?.data, { max: MAX_QUARTIERS, min: SEUIL_QUARTIER_INDEXABLE });
  return items ? { ville, items } : null;
}

/**
 * Les quatre sections, demandées en parallèle. Les quartiers attendent les villes — c'est la ville
 * la plus fournie du catalogue dont on montre les quartiers —, mais les villes sont en cache
 * partagé : l'attente est celle d'une lecture de cache, pas d'un aller-retour par visiteur.
 */
export async function raccourcisDeLAccueil(locale: string): Promise<RaccourcisDeLAccueil> {
  const [vente, lesTypes, lieux] = await Promise.all([
    biensAVendre(locale),
    types(),
    villes().then(async (lesVilles) => ({
      villes: lesVilles,
      quartiers: lesVilles ? await quartiers(lesVilles[0].valeur) : null,
    })),
  ]);
  return { vente, types: lesTypes, ...lieux };
}
