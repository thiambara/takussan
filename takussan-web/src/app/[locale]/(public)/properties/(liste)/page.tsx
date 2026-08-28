import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getLocale } from 'next-intl/server';
import { PropertiesDiscoveryPage } from '@/components/property/PropertiesDiscoveryPage';

import { PropertiesSkeleton } from './loading';
import { alternatesPubliques } from '@/lib/alternates';
import { cheminCanoniqueDeLaListe, versParametres } from '@/lib/canonique';
import { rechercherBiensPublics } from '@/lib/queries/public-search';
import {
  clefDeRecherche,
  parametresDeRecherche,
  parametresDepuisNext,
} from '@/lib/recherche-publique';
import { titreEtDescription } from '@/lib/titre-de-la-liste';
import { isLocale } from '@/i18n/config';

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Le `<title>` et la `<meta description>` de la liste, DÉRIVÉS des filtres retenus — TCK-433 · AC3.
 *
 * ⚠️ `titreEtDescription` vivait ICI. TCK-432 l'a déplacée dans `lib/titre-de-la-liste.ts` **sans
 * la modifier**, parce que le `<h1>` de la page en a désormais besoin lui aussi : un onglet qui
 * annonce « Villa à louer à Dakar » au-dessus d'un `<h1>` générique est une page qui se contredit,
 * et deux dérivations écrites séparément finiraient par diverger.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = versParametres(await searchParams);
  const { title, description } = await titreEtDescription(params);

  const locale = await getLocale();
  const chemin = cheminCanoniqueDeLaListe(params);

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
 * `/properties` — la surface de découverte, **dont les résultats sont désormais dans le HTML de la
 * première réponse** (TCK-432).
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI A CHANGÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La page rendait `<PropertiesDiscoveryPage />` seule, et celle-ci allait chercher les résultats par
 * `useSearch` → `useEffect` → `apiFetch`. Un `useEffect` ne s'exécute pas pendant le rendu serveur :
 * le HTML servi ne contenait **aucun bien** (mesuré le 2026-08-28 sur `?type=villa` : 0/25 titres,
 * 0 lien `/properties/<slug>`).
 *
 * La page est maintenant un composant serveur `async` qui exécute la recherche **avec les filtres
 * de l'URL** et sème le résultat. Les deux propriétés qui comptent :
 *
 * · **le filtrage reste SERVEUR** — la requête envoyée est celle que l'URL décrit, construite par
 *   `parametresDeRecherche`, la même fonction que le client. Un rendu qui servirait le catalogue
 *   entier puis filtrerait à l'affichage échouerait AC2, et violerait `CLAUDE.md` § Sparse
 *   fieldsets ;
 * · **la graine porte sa CLEF** — `useSearch` ne réutilise le résultat que si l'URL décrit toujours
 *   la même requête. Sans elle, un clic sur « Appartement » réafficherait les villas du serveur
 *   sous une puce « Appartement ».
 *
 * ⚠️ **`<Suspense>` reste, et le `loading.tsx` du groupe `(liste)` aussi.** `PropertiesDiscoveryPage`
 * lit `useSearchParams` : son rendu peut suspendre, et un `<Suspense>` sans repli ne montrerait
 * rien (TCK-335, étape 6). Surtout, **ne pas les déplacer** : en Next, une frontière de suspension
 * jette le statut HTTP, et c'est le groupe `(liste)` — un dossier qui ne change pas l'URL — qui
 * empêche ce `loading.tsx` de couvrir `/properties/[slug]` et d'y transformer le 404 de `notFound()`
 * en 200. Vérifié après ce ticket : `/fr/properties/slug-inexistant` rend toujours **404**.
 */
export default async function Page({ searchParams }: Props) {
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';

  // ⚠ `parametresDepuisNext`, pas `versParametres` : celle de la canonique garde la PREMIÈRE valeur
  // d'un paramètre répété. Ici tout doit passer, sans quoi `?tags=a&tags=b` partirait amputé au
  // serveur et complet au client — deux listes pour un seul écran.
  const requete = parametresDeRecherche(parametresDepuisNext(await searchParams));
  const resultat = await rechercherBiensPublics(requete.toString(), locale);

  const { title } = await titreEtDescription(versParametres(await searchParams));

  return (
    // `fallback` n'était PAS passé (TCK-335, étape 6) : un `<Suspense>` sans repli ne montre
    // rien pendant la suspension. `PropertiesDiscoveryPage` lit `useSearchParams`, donc son
    // rendu SUSPEND — c'est exactement le moment que ce repli couvre. Il partage le squelette
    // de `loading.tsx`, qui couvre l'instant d'avant : la navigation.
    <Suspense fallback={<PropertiesSkeleton />}>
      <PropertiesDiscoveryPage
        titre={title}
        graine={
          // `null` sur panne — y compris un 422. L'arbitrage d'erreur est déjà pris, et mieux,
          // par `PropertiesDiscoveryPage` : cf. `rechercherBiensPublics`.
          resultat ? { resultat, clef: clefDeRecherche(requete) } : null
        }
      />
    </Suspense>
  );
}
