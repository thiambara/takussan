import { cache } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { PropertyDetail, PropertyListItem } from '@/types/property';

/**
 * TCK-598 (ADR-0052 §1) — la durée de vie des données de la fiche dans le cache de Next : le retard
 * MAXIMAL d'un changement que l'invalidation signée n'a pas porté (photos, avis, agence, contact) —
 * et du compteur de vues affiché (contrainte 4, accepté par le porteur le 2026-10-06).
 */
export const FRAICHEUR_FICHE_SECONDES = 300;

/** L'étiquette de cache d'une fiche, que `api/revalidation/fiche` expire sur appel signé de l'API. */
export function etiquetteDeFiche(slug: string): string {
  return `property:${slug}`;
}

/**
 * Ce que la fiche publique a obtenu du serveur — **trois issues, jamais deux** (TCK-335, étape 6).
 *
 * Le code d'avant faisait `try { … } catch { return null }` et retombait sur un seul cas :
 * « pas de bien ». Mesuré en production le 2026-08-21, c'est un **soft-404 servi en HTTP 200** :
 *
 * ```
 * $ curl -s -o /dev/null -w '%{http_code}' \
 *     https://www.takussan.com/properties/studio-meuble-a-parcelles-assainies-5Kyslt
 * 200
 * $ … | grep -o '<title>[^<]*'
 * <title>Bien introuvable — Takussan
 * ```
 *
 * — c'est-à-dire, pour un moteur, une page valide qui affirme que le bien n'existe pas, sur toute
 * la surface indexable du catalogue. Un 404 amont et une API injoignable ne demandent pourtant pas
 * la même réponse, et c'est le repli silencieux qui les confondait :
 *
 * - `introuvable` (**404 amont**) → `notFound()`, donc un VRAI 404 ;
 * - `indisponible` (**toute autre panne** : 5xx, réseau, corps illisible) → état explicite,
 *   plus `robots: { index: false }`. Le bien existe peut-être ; on ne dit surtout pas qu'il
 *   n'existe pas, et on n'invite pas l'indexation d'une page vide.
 *
 * ⚠️ Ne pas re-fusionner ces deux cas « pour simplifier ». Remplacer un repli silencieux par un
 * autre repli silencieux ne corrige rien.
 */
export type ResultatFichePublique =
  | { readonly etat: 'trouve'; readonly bien: PropertyDetail }
  | { readonly etat: 'introuvable' }
  | { readonly etat: 'indisponible' };

/**
 * Le bien public d'un slug, **une seule fois par requête HTTP**.
 *
 * `cache()` de React mémoïse par identité d'arguments pour la durée du rendu : `generateMetadata`
 * et la page appellent donc la même fonction et déclenchent **un** aller-retour, là où l'ancienne
 * paire `layout.generateMetadata` + `useProperty` en faisait deux (le serveur récupérait le bien
 * pour le `<title>` puis le jetait, et le navigateur le redemandait après hydratation).
 *
 * ⚠️ **La locale est un ARGUMENT, pas une déduction.** `apiFetch` la devine sinon depuis
 * `document.cookie`, qui n'existe pas en rendu serveur — et rend `undefined` **en silence** : les
 * libellés d'énumération (`type_label`, `contract_type_label`) sortiraient dans `APP_LOCALE`.
 * Elle entre aussi dans la clé de mémoïsation, ce qui est exactement ce qu'on veut : deux locales
 * ne partagent pas une réponse.
 *
 * ⚠️ **Aucun `fields[properties]`, et c'est MESURÉ.** `PublicPropertyController::show()` l'ignore
 * — 47 clés dans les deux cas — parce que spatie ne restreint que le `SELECT` SQL et n'a aucune
 * prise sur `toArray()` d'une ressource (audit 2026-08-21, §6). Le garder ne gagnait donc pas un
 * octet, faisait diverger les URL entre appelants (donc interdisait la mémoïsation), et portait
 * une bombe à retardement : `main_photo_url`, `location` et `type_label` ne figurent pas dans
 * `Property::$queryFields`, si bien que le jour où `show()` passerait par `buildQuery()`, spatie
 * répondrait **400 InvalidFieldQuery**.
 */
export const getProperty = cache(
  async (slug: string, locale: string): Promise<ResultatFichePublique> => {
    try {
      // TCK-598 — lecture PARTAGÉE, en cache de données étiqueté par slug : une visite ne coûte
      // plus un aller-retour à l'API, une revalidation par langue et par fenêtre le fait. Aucun
      // en-tête propre au visiteur (`partage`) : ni IP ni jeton ne fragmentent la clé, et le corps
      // de `public.*` ne dépend plus de l'appelant (contrainte 2). La vue se compte à part, depuis
      // le navigateur (`CompteurDeVue`). Seules les réponses 200 entrent au cache : un 404 n'y
      // reste pas.
      const res = await apiFetch<{ data: PropertyDetail }>(
        `/public/properties/${encodeURIComponent(slug)}`,
        { next: { revalidate: FRAICHEUR_FICHE_SECONDES, tags: [etiquetteDeFiche(slug)] } } as RequestInit,
        { locale, partage: true },
      );
      return { etat: 'trouve', bien: res.data };
    } catch (err: unknown) {
      // 404 : le catalogue public a répondu, et il dit que ce slug n'existe pas (ou n'est plus
      // public). C'est la SEULE panne dont on sache qu'elle mérite un 404.
      if (err instanceof ApiError && err.status === 404) return { etat: 'introuvable' };

      // Tout le reste — 5xx, 429, API éteinte, JSON illisible — est une panne de NOTRE côté.
      // Elle part au journal serveur : elle est utile au développeur, jamais au visiteur.
      console.error(`[fiche publique] ${slug} : `, err);
      return { etat: 'indisponible' };
    }
  },
);

/** TCK-598 (V10) — ce qu'est devenu un bien dont la fiche rend 404. Des CODES : le front traduit. */
export type EtatPublicDuBien = {
  readonly state: 'available' | 'rented' | 'sold' | 'withdrawn';
  readonly contract_type: string | null;
  readonly type: string | null;
  readonly location: { readonly city: string | null; readonly quarter: string | null };
  readonly similar: readonly PropertyListItem[];
};

/**
 * L'état d'un bien dont la fiche a rendu 404 — `null` si l'API dit 404 à son tour (le bien n'a
 * jamais été une annonce publique, ou n'existe pas : indiscernables, et c'est voulu), ou si elle ne
 * répond pas (on ne dira alors rien de plus que le 404).
 *
 * Appel rendu POUR le visiteur, hors cache : il n'a lieu que sur un 404 de la fiche.
 */
export const getEtatDuBien = cache(
  async (slug: string, locale: string): Promise<EtatPublicDuBien | null> => {
    try {
      const res = await apiFetch<{ data: EtatPublicDuBien }>(
        `/public/properties/${encodeURIComponent(slug)}/status`,
        undefined,
        { locale },
      );
      return res.data;
    } catch (err: unknown) {
      if (!(err instanceof ApiError && err.status === 404)) {
        console.error(`[fiche publique] état de ${slug} : `, err);
      }
      return null;
    }
  },
);
