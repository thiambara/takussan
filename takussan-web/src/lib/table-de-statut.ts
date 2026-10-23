/**
 * TCK-1834 (P146.04) — lire une table de statut typée `Record<Union, V>` avec une valeur que
 * l'API sert en `string`.
 *
 * Les tables de tons et de libellés sont typées par l'union du front (`Record<UserStatus, …>`) :
 * `tsc` refuse alors une table à qui manque un cas, ce que `Record<string, …>` laissait passer en
 * silence (repli sur le ton neutre ou sur la valeur brute). Mais beaucoup de champs arrivent en
 * `string` (`status: string | null`) : on ne peut pas indexer la table avec eux sans transtypage.
 * Ces deux fonctions font ce transtypage une fois, en vérifiant que la clé est bien PROPRE à la
 * table — une clé héritée de l'objet (`constructor`) n'est pas un statut.
 *
 * Un statut hors de l'union rend `undefined` : l'appelant garde son repli.
 */
export function estCleDe<K extends string>(
  table: Readonly<Record<K, unknown>>,
  valeur: string | null | undefined,
): valeur is K {
  return valeur != null && Object.prototype.hasOwnProperty.call(table, valeur);
}

export function lireTable<K extends string, V>(
  table: Readonly<Record<K, V>>,
  valeur: string | null | undefined,
): V | undefined {
  return estCleDe(table, valeur) ? table[valeur] : undefined;
}
