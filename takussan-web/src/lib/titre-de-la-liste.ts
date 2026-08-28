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
