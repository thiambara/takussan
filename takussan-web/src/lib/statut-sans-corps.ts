/**
 * TCK-848 (P41.01) — les statuts HTTP dont la réponse n'a pas de corps.
 *
 * `new Response(corps, { status })` lève sur 204, 205 et 304 dès que `corps` n'est pas `null`,
 * même vide (`Invalid response status code 204`). Un relais BFF qui recopie le corps amont doit
 * donc passer `null` pour ces statuts, sans quoi Next rend 500 sur une écriture réussie.
 */
export function statutSansCorps(statut: number): boolean {
  return statut === 204 || statut === 205 || statut === 304;
}
