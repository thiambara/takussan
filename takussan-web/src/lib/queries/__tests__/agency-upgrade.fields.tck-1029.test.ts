import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGENCY_UPGRADE_REQUEST_FIELDS } from '../agency-upgrade';

/**
 * TCK-1029 (P68.01) — la liste des demandes de passage ne demande que ce que l'API accepte.
 *
 * Depuis TCK-601, `AgencyUpgradeRequest::$queryFields` ne porte plus `ninea` ni `rib_pro`, et
 * spatie refuse en 400 tout `fields[agency_upgrade_requests]` qui les nomme. La constante du
 * front les demandait encore : chaque appel de `fetchAgencyUpgradeRequests` rendait 400, la page
 * de passage rendait l'erreur et la barre latérale ne voyait jamais la demande en cours.
 *
 * Les deux listes sont LUES ici, aucune n'est recopiée : la PHP dans le modèle, la TS importée.
 */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const MODELE = join(RACINE, 'takussan-api', 'app', 'Models', 'AgencyUpgradeRequest.php');

function colonnesDemandables(): Set<string> {
  const php = readFileSync(MODELE, 'utf8');
  const bloc = /protected static array \$queryFields = \[([\s\S]*?)\];/.exec(php);
  expect(bloc, `$queryFields introuvable dans ${MODELE}`).not.toBeNull();
  const cles = [...bloc![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  // Plancher de vacuité : 14 colonnes mesurées le 2026-10-20.
  expect(cles.length, 'aucune colonne extraite de $queryFields').toBeGreaterThanOrEqual(10);
  return new Set(cles);
}

describe('AGENCY_UPGRADE_REQUEST_FIELDS (TCK-1029)', () => {
  it("ne demande que des colonnes de AgencyUpgradeRequest::$queryFields", () => {
    const permises = colonnesDemandables();
    const refusees = AGENCY_UPGRADE_REQUEST_FIELDS.filter((c) => !permises.has(c));
    expect(refusees).toEqual([]);
  });
});
