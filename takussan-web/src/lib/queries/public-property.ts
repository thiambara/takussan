import { cache } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { PropertyDetail } from '@/types/property';

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
      const res = await apiFetch<{ data: PropertyDetail }>(
        `/public/properties/${encodeURIComponent(slug)}`,
        undefined,
        { locale },
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
