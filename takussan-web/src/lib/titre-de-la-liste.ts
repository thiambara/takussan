import { getTranslations } from 'next-intl/server';

import { filtresCanoniques } from '@/lib/canonique';

/**
 * Le `<title>`, la `<meta description>` et le `<h1>` de `/properties` — **une dérivation, trois
 * usages** (TCK-433 pour les deux premiers, TCK-432 pour le troisième).
 *
 * La fonction vivait dans `page.tsx`, où seule `generateMetadata` l'appelait. Le `<h1>` de TCK-432
 * en a besoin aussi, et **le faire dériver de la même fonction n'est pas une économie de lignes** :
 * un titre d'onglet qui annonce « Villa à louer à Dakar » au-dessus d'un `<h1>` générique est une
 * page qui se contredit elle-même, et rien dans le typage ne l'attraperait. Le seul moyen que les
 * deux ne divergent jamais est qu'il n'y ait qu'une source.
 *
 * ⚠️ Le sujet est le TYPE quand il est seul retenu (« Villa »), sinon un générique (« Biens
 * immobiliers »). Le type multiple ne passe pas le filtre de canonicité, il n'arrive donc jamais
 * ici — cf. `filtresCanoniques`.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI N'EST **PAS** GARDÉ ICI, ET QU'IL FAUT SAVOIR AVANT DE LIRE LE RESTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `t.has()` ci-dessous garde `type`. Il **ne garde pas `city`**, et ce n'est pas un oubli : la
 * liste des villes n'est pas dans le dictionnaire — il n'y a rien contre quoi la vérifier. `city`
 * est donc le seul des trois champs canoniques dont la valeur soit **libre**, et il traverse la
 * même dérivation jusqu'au `<title>` ET au `<h1>`.
 *
 * Mesuré le 2026-08-28 sur `/fr/properties?city=%3Cb%3EPIRATE%3C%2Fb%3E%20Dakar` :
 *
 * ```
 * <h1 …>Biens immobiliers à &lt;b&gt;PIRATE&lt;/b&gt; Dakar</h1>
 * <title>Biens immobiliers à &lt;b&gt;PIRATE&lt;/b&gt; Dakar — Takussan</title>
 * ```
 *
 * **Pas d'injection** — React échappe, et la balise `<b>` n'entre pas dans le document (vérifié :
 * aucun `<h1…><b>` dans le HTML servi). Mais c'est un texte **choisi par l'appelant du lien**,
 * placé en `<h1>` et en `<title>`, sur une URL que `filtresCanoniques` déclare canonique — donc
 * indexable, et se déclarant elle-même comme page de référence.
 *
 * ⚠ **Ce n'est pas corrigé ici, délibérément.** La réponse n'est pas un garde-fou de libellé mais
 * une décision de canonicité : `canonique.ts` fonde la canonicité de `city` sur le fait que son
 * ensemble de valeurs serait « les villes du catalogue », ce que rien n'applique. Corriger le
 * libellé sans corriger la canonicité laisserait l'URL indexable ; corriger la canonicité est la
 * surface de TCK-433. **À router vers un ticket propre.**
 *
 * Les libellés viennent du dictionnaire next-intl (principe non négociable n°5) et les deux
 * gabarits — `titleContract` et `titleCity` — sont composés plutôt que concaténés : chaque langue
 * y décide de son ORDRE et de sa préposition. Une concaténation `${type} ${contrat} à ${ville}`
 * aurait figé la syntaxe française dans les trois.
 */
export async function titreEtDescription(
  params: URLSearchParams,
): Promise<{ title: string; description: string }> {
  const tBase = await getTranslations('meta.properties');
  const retenus = filtresCanoniques(params);

  if (retenus.size === 0) {
    return { title: tBase('title'), description: tBase('description') };
  }

  const t = await getTranslations('meta.propertiesFiltered');
  const tTypes = await getTranslations('property.types');

  const type = retenus.get('type');
  const contrat = retenus.get('contract_type');
  const ville = retenus.get('city');

  // ⚠️ **`type` vient de l'URL, et RIEN ne l'a validé avant d'arriver ici.** `filtresCanoniques`
  // ne fait que le LIRE : `?type=nimportequoi` traverse le filtre de canonicité intact.
  //
  // Mesuré le 2026-08-28 sur `/fr/properties?type=nimportequoi`, AVANT ce garde-fou :
  //
  //     <title>property.types.nimportequoi — Takussan</title>
  //     [journal serveur] MISSING_MESSAGE: Could not resolve `property.types.nimportequoi`
  //
  // — c'est-à-dire un CHEMIN DE DICTIONNAIRE affiché comme titre de page. Le défaut est arrivé
  // avec TCK-433 et n'y était visible que dans l'onglet ; TCK-432 l'aurait rendu visible EN GRAND,
  // le `<h1>` dérivant de la même fonction. C'est le prix d'une dérivation unique, et c'est aussi
  // sa valeur : le correctif se pose une fois pour les trois usages.
  //
  // `t.has()` est le prédicat EXACT de l'exigence — « le libellé vient du dictionnaire » — et non
  // une approximation par liste d'énumération, qui serait une seconde énumération à tenir. Un type
  // réel dont le libellé manquerait retomberait sur le sujet générique : dégradé, jamais faux.
  const libelleDuType =
    type && tTypes.has(type as Parameters<typeof tTypes.has>[0]) ? tTypes(type) : null;

  let titre = libelleDuType ?? t('subjectAny');
  if (contrat) titre = t('titleContract', { subject: titre, contract: contrat });
  if (ville) titre = t('titleCity', { subject: titre, city: ville });

  return { title: titre, description: t('description', { title: titre }) };
}
