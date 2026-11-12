/**
 * TCK-2590, TCK-2589 — les attributs CALCULÉS qu'un modèle de l'API accepte dans `fields[<table>]`
 * hors de `$queryFields` : son `buildQuery()` les retire de la requête avant spatie, et la ressource
 * les rend. Les noms sont lus dans la constante `FIELDS` du fichier de l'API, jamais recopiés.
 *
 * Lu par deux gardes : `fields-demandables.tck-1184` (une liste les demande) et
 * `show-sans-fields.garde` (la fiche client les demande à son show, seule exception).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE_DU_DEPOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

export const ATTRIBUTS_CALCULES: Record<string, { readonly source: string; readonly modele: string; readonly appel: RegExp }> = {
  customers: {
    source: 'Services/Crm/CustomerCommercialAttributes.php',
    modele: 'Models/Customer.php',
    // Un APPEL sur la requête, pas la mention `{@see …::strip()}` du docblock.
    appel: /=\s*CustomerCommercialAttributes::strip\(\$request\b/,
  },
};

export function attributsCalcules(table: string): string[] {
  const entree = ATTRIBUTS_CALCULES[table];
  if (!entree) return [];
  const php = readFileSync(join(RACINE_DU_DEPOT, 'takussan-api', 'app', entree.source), 'utf8');
  const bloc = /public const FIELDS = \[([^\]]*)\];/.exec(php);
  return bloc ? [...bloc[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]) : [];
}
