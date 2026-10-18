import { apiFetch } from '@/lib/api';
import { type DomainesDeFacette, domainesStatiques } from '@/lib/canonique';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { cheminApi } from '@/lib/chemin-api';
import type { ContractType } from '@/types/property';

/**
 * Le DOMAINE de la facette `city` — TCK-433, passe 2.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `src/lib/canonique.ts` retient trois clés comme facettes indexables **parce que leur ensemble de
 * valeurs est fini et énumérable**. `type` et `contract_type` le sont dans le dépôt
 * (`propertyTypeValues`, `contractTypeValues`). `city` ne l'était **nulle part** : mesuré le
 * 2026-08-27 sur un build de production, `?city=Zzzinventee` rendait une URL `index, follow`,
 * canonique d'elle-même, avec un `<title>` dérivé de la valeur fournie. L'espace d'URL indexables
 * était donc non borné — le défaut exact que TCK-433 existe pour fermer, ramené d'un cran.
 *
 * *Un ensemble énumérable dont personne ne vérifie l'appartenance n'est pas un ensemble fini,
 * c'est une intention.*
 */

/** P35.05 — le compte de la ville par contrat ; l'API sert les deux, zéro compris. */
export type ComptesParContrat = Readonly<Partial<Record<ContractType, number>>>;

type VilleAvecCompte = {
  readonly value: string;
  readonly count: number;
  readonly contracts?: ComptesParContrat;
};

type ReponseVilles = {
  readonly data: readonly VilleAvecCompte[];
  readonly meta: { readonly truncated: boolean };
};

/**
 * P35.05 — le SEUIL d'une page de ville, décidé par le porteur « comme le quartier » : une ville
 * n'est canonique d'une page (et n'entre au sitemap) qu'à partir de ce nombre de biens publics.
 * En dessous, `?city=…` se replie sur la page nue : une page indexable pour un ou deux biens est
 * la page mince que le seuil du quartier évite déjà. Le même seuil vaut pour la paire contrat ×
 * ville au sitemap, compté sur les biens du contrat.
 */
export const SEUIL_VILLE_INDEXABLE = 3;

/**
 * Fraîcheur du domaine. Une ville entre ou sort du catalogue au rythme des annonces, pas des
 * déploiements — et l'appel se fait dans la `generateMetadata` de la page publique la plus
 * parcourue. `revalidate` partage donc une seule réponse entre tous les visiteurs d'une heure,
 * là où le défaut de `fetch` sous Next 16 (`no-store`) en ferait un aller-retour par rendu.
 */
export const FRAICHEUR_DOMAINE_VILLES = 3600;

/**
 * Les villes du catalogue, repliées en minuscules → la casse CANONIQUE du catalogue.
 *
 * ⚠️ **Rend `null` — et non un ensemble vide — quand le domaine est inconnaissable** : API
 * injoignable, ou domaine tronqué côté serveur. Les deux cas doivent produire le même
 * comportement chez l'appelant (replier toute facette de ville sur la page nue), et ils ne
 * doivent surtout pas ressembler à « le catalogue n'a aucune ville », qui est une réponse.
 *
 * *Un domaine tronqué n'est pas un domaine* : s'en servir reviendrait à déclarer non canoniques
 * les villes qui n'ont pas tenu dans le plafond, c'est-à-dire à décider par un effet de bord.
 */
export async function villesDuCatalogue(): Promise<Map<string, string> | null> {
  try {
    const reponse = await apiFetch<ReponseVilles>(
      '/public/properties/cities',
      { next: { revalidate: FRAICHEUR_DOMAINE_VILLES } } as RequestInit,
      // TCK-598 — PARTAGÉ : en cache de données, la même réponse sert tous les visiteurs. Une IP
      // dans la clé la fragmenterait, et lire les en-têtes entrants rendrait la route dynamique.
      { locale: DEFAULT_LOCALE, partage: true },
    );

    if (reponse.meta?.truncated) {
      console.error(
        '[canonique] le domaine des villes est TRONQUÉ côté API : toute facette de ville se replie ' +
          'sur la page nue plutôt que de rejeter en silence les villes absentes du plafond.',
      );
      return null;
    }

    // Repli de casse → valeur canonique. `?city=dakar` et `?city=Dakar` désignent la même page ;
    // sans cette table, ils produiraient deux canoniques. P35.04 : la PREMIÈRE graphie lue gagne,
    // l'API triant par compte décroissant ; le dernier `set` retenait la moins fréquente.
    const domaine = new Map<string, string>();
    for (const { value, count } of reponse.data) {
      const cle = value?.toLocaleLowerCase('fr');
      if (cle && !domaine.has(cle) && count >= SEUIL_VILLE_INDEXABLE) domaine.set(cle, value);
    }
    return domaine;
  } catch (err) {
    console.error(
      '[canonique] domaine des villes indisponible — toute facette de ville se replie sur la page nue.',
      err,
    );
    return null;
  }
}

/**
 * TCK-598 (V14, contrainte 12) — le SEUIL d'une page de quartier : un quartier n'est canonique
 * d'une page (et n'entre au sitemap) que s'il compte au moins ce nombre de biens publics dans la
 * ville de l'URL. En dessous, `?city=Dakar&location=Ngor` se replie sur `?city=Dakar` : une page
 * indexable pour un ou deux biens serait une page mince, et une par quartier saisi à la main.
 * *Option retenue par défaut, non tranchée par le porteur* (N = 3).
 */
export const SEUIL_QUARTIER_INDEXABLE = 3;

type ReponseQuartiers = ReponseVilles;

/** La graphie de repli d'une ville ou d'un quartier — la même que `villesDuCatalogue`. */
export function replie(valeur: string): string {
  return valeur.trim().toLocaleLowerCase('fr');
}

/**
 * Les quartiers INDEXABLES d'une ville : repli de casse → graphie canonique, pour les seuls
 * quartiers qui atteignent {@link SEUIL_QUARTIER_INDEXABLE}. `null` si le domaine est
 * inconnaissable (API injoignable, domaine tronqué) — même contrat que `villesDuCatalogue`.
 *
 * L'API replie déjà les variantes de casse (« Mermoz » et « MERMOZ » : une entrée, comptée deux) :
 * le seuil s'applique donc au quartier, pas à une graphie.
 *
 * Appel PARTAGÉ, en cache de données comme le domaine des villes.
 */
export async function quartiersDeLaVille(ville: string): Promise<Map<string, string> | null> {
  try {
    const reponse = await apiFetch<ReponseQuartiers>(
      cheminApi`/public/properties/neighborhoods?city=${encodeURIComponent(ville)}`,
      { next: { revalidate: FRAICHEUR_DOMAINE_VILLES } } as RequestInit,
      { locale: DEFAULT_LOCALE, partage: true },
    );

    if (reponse.meta?.truncated) {
      console.error(
        `[canonique] le domaine des quartiers de ${ville} est TRONQUÉ côté API : toute facette de ` +
          `quartier s'y replie sur la page de la ville.`,
      );
      return null;
    }

    const domaine = new Map<string, string>();
    for (const { value, count } of reponse.data) {
      if (value && count >= SEUIL_QUARTIER_INDEXABLE) domaine.set(replie(value), value);
    }
    return domaine;
  } catch (err) {
    console.error(
      `[canonique] domaine des quartiers de ${ville} indisponible — toute facette de quartier s'y ` +
        `replie sur la page de la ville.`,
      err,
    );
    return null;
  }
}

/**
 * Les villes du catalogue AVEC leur compte, pour le sitemap : une ville qui compte moins de
 * {@link SEUIL_QUARTIER_INDEXABLE} biens ne peut pas avoir de quartier indexable, et ne coûte donc
 * pas d'appel de plus. Même URL et mêmes options que `villesDuCatalogue` : une seule entrée de cache.
 */
export async function villesAvecComptes(): Promise<readonly VilleAvecCompte[]> {
  const reponse = await apiFetch<ReponseVilles>(
    '/public/properties/cities',
    { next: { revalidate: FRAICHEUR_DOMAINE_VILLES } } as RequestInit,
    { locale: DEFAULT_LOCALE, partage: true },
  );
  if (reponse.meta?.truncated) {
    throw new Error('[sitemap] domaine des villes TRONQUÉ côté API : la source des villes refuse de mentir.');
  }
  return reponse.data.filter((v) => v.value);
}

/**
 * TCK-841 (P35.03) — le nombre de biens publics d'une ville, ou d'un quartier dans SA ville, pour la
 * description d'une page de lieu. Pris aux domaines déjà en cache : mêmes URL et mêmes options que
 * `villesAvecComptes` et `quartiersDeLaVille`, donc les mêmes entrées du cache de données, sans
 * aller-retour de plus.
 *
 * `undefined` quand le lieu n'y est pas ou que le domaine est indisponible : la description se
 * passe alors du compte, elle ne fait pas échouer la page.
 */
export async function compteDuLieu(ville: string, quartier?: string): Promise<number | undefined> {
  try {
    if (quartier) {
      const reponse = await apiFetch<ReponseQuartiers>(
        cheminApi`/public/properties/neighborhoods?city=${encodeURIComponent(ville)}`,
        { next: { revalidate: FRAICHEUR_DOMAINE_VILLES } } as RequestInit,
        { locale: DEFAULT_LOCALE, partage: true },
      );
      return reponse.data.find((q) => q.value && replie(q.value) === replie(quartier))?.count;
    }
    const villes = await villesAvecComptes();
    return villes.find((v) => replie(v.value) === replie(ville))?.count;
  } catch {
    return undefined;
  }
}

/**
 * Les domaines des QUATRE facettes de la liste pour une requête donnée — TCK-598.
 *
 * Le domaine des quartiers n'est demandé que si l'URL porte un quartier ET une ville du catalogue :
 * un quartier se juge dans SA ville, et la page nue ou la page de ville n'en paient aucun appel.
 */
export async function domainesDeLaListe(params: URLSearchParams): Promise<DomainesDeFacette> {
  const villes = await villesDuCatalogue();
  const ville = params.get('city');
  const villeCanonique = ville && villes ? villes.get(replie(ville)) : undefined;
  const quartiers =
    villeCanonique && (params.get('location') ?? '').trim() !== ''
      ? await quartiersDeLaVille(villeCanonique)
      : null;

  return { ...domainesStatiques(), villes, quartiers };
}
