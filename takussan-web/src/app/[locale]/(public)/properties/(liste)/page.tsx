import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PropertiesDiscoveryPage } from '@/components/property/PropertiesDiscoveryPage';

import { PropertiesSkeleton } from './loading';
import { alternatesPubliques } from '@/lib/alternates';
import {
  type DomainesDeFacette,
  cheminCanoniqueDeLaListe,
  domainesStatiques,
  filtresCanoniques,
  versParametres,
} from '@/lib/canonique';
import { villesDuCatalogue } from '@/lib/queries/facettes';
import { isLocale } from '@/i18n/config';

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Le `<title>` et la `<meta description>` de la liste, DÉRIVÉS des filtres retenus — TCK-433 · AC3.
 *
 * Les libellés viennent du dictionnaire next-intl (principe non négociable n°5) et les deux
 * gabarits — `titleContract` et `titleCity` — sont composés plutôt que concaténés : chaque langue
 * y décide de son ORDRE et de sa préposition. Une concaténation `${type} ${contrat} à ${ville}`
 * aurait figé la syntaxe française dans les trois.
 *
 * Le sujet est le TYPE quand il est seul retenu (« Villa »), sinon un générique (« Biens
 * immobiliers »). Le type multiple ne passe pas le filtre de canonicité, il n'arrive donc jamais
 * ici — cf. `filtresCanoniques`.
 *
 * ⚠️ **`tTypes(type)` ne peut plus manquer, et c'est ce qui a été corrigé le 2026-08-28.** Le
 * `type` reçu ici a traversé le contrôle de domaine : c'est une valeur de `propertyTypeValues`,
 * dont le dictionnaire porte les 16 clés. Auparavant, `?type=zzznexistepas` faisait rendre
 * `<title>property.types.zzznexistepas — Takussan</title>` sur une page `index, follow`
 * canonique d'elle-même — une clé d'i18n brute servie à un moteur. `next-intl` journalisait bien
 * `MISSING_MESSAGE`, ce qui ne changeait rien à ce qui était servi.
 */
async function titreEtDescription(params: URLSearchParams, domaines: DomainesDeFacette) {
  const tBase = await getTranslations('meta.properties');
  const retenus = filtresCanoniques(params, domaines);

  if (retenus.size === 0) {
    return { title: tBase('title'), description: tBase('description') };
  }

  const t = await getTranslations('meta.propertiesFiltered');
  const tTypes = await getTranslations('property.types');

  const type = retenus.get('type');
  const contrat = retenus.get('contract_type');
  const ville = retenus.get('city');

  let titre = type ? tTypes(type) : t('subjectAny');
  if (contrat) titre = t('titleContract', { subject: titre, contract: contrat });
  if (ville) titre = t('titleCity', { subject: titre, city: ville });

  return { title: titre, description: t('description', { title: titre }) };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = versParametres(await searchParams);

  // Les DOMAINES des trois facettes. Les deux premiers sont connus du dépôt ; le troisième vient
  // du catalogue, en une réponse partagée par heure — et vaut `null` s'il est inconnaissable,
  // auquel cas toute facette de ville se replie sur la page nue.
  const domaines: DomainesDeFacette = {
    ...domainesStatiques(),
    villes: await villesDuCatalogue(),
  };

  const { title, description } = await titreEtDescription(params, domaines);

  const locale = await getLocale();
  const chemin = cheminCanoniqueDeLaListe(params, domaines);

  return {
    title,
    description,
    // ⚠️ Canonique ET `hreflang` dérivent du même chemin CANONIQUE, pas de l'URL demandée : sur
    // `?type=villa&page=3&sort=-created_at&per_page=48`, les quatre déclarations désignent
    // `/‹langue›/properties?type=villa`. Deux signaux qui se contredisent font ignorer le groupe
    // entier — cf. `alternatesPubliques`.
    alternates: alternatesPubliques(chemin, isLocale(locale) ? locale : 'fr'),
  };
}

/**
 * Wave 3 — `/properties` discovery surface. Embeds the shared filter rail,
 * the list/map view toggle, and the « Sauvegarder la recherche » CTA.
 */
export default function Page() {
  return (
    // `fallback` n'était PAS passé (TCK-335, étape 6) : un `<Suspense>` sans repli ne montre
    // rien pendant la suspension. `PropertiesDiscoveryPage` lit `useSearchParams`, donc son
    // rendu SUSPEND — c'est exactement le moment que ce repli couvre. Il partage le squelette
    // de `loading.tsx`, qui couvre l'instant d'avant : la navigation.
    <Suspense fallback={<PropertiesSkeleton />}>
      <PropertiesDiscoveryPage />
    </Suspense>
  );
}
