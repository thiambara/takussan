/**
 * TCK-2780 — `GET /api/leases/{id}` ne rend le locataire que sous `include=tenant`, et seulement les clés
 * de `fields[customers]`. La fiche du bail le demande avec ce qu'elle en lit ; l'onglet « Location » du
 * bien, qui n'en lit rien, ne le demande pas.
 */
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { doublerLApi } from '@/test/api-simulee';
import { rendreLeHook } from '@/test/rendu';

import { useLease } from '@/lib/queries/leases';

// TCK-3010 — le bail servi par l'API simulée : `show` le rend entier (il ne lit pas `fields[leases]`).
const api = doublerLApi().servir('baux', [{ id: 80, reference_number: 'BAIL-0080' }]);

async function requeteDe(appel: () => unknown): Promise<{ chemin: string; params: URLSearchParams }> {
  rendreLeHook(appel);
  await waitFor(() => expect(api.appels()).toHaveLength(1));
  const [{ chemin, requete }] = api.appels();
  return { chemin, params: requete };
}

describe('TCK-2780 — le locataire du bail, à la demande', () => {
  it('la fiche du bail demande le locataire, avec les seules clés qu’elle lit', async () => {
    const { chemin, params } = await requeteDe(() => useLease(80, { avecLocataire: true }));
    expect(chemin).toBe('/api/leases/80');
    // TCK-2912 — la fiche seule demande aussi ses calculs (TCK-2906) : « Interventions (n) » et les
    // comptes des onglets « Documents (n) » / « Historique (n) » (`LeaseController::show`).
    expect(params.get('include')?.split(',')).toEqual([
      'property', 'landlord', 'agent', 'tenant', 'maintenance_summary', 'documentsCount', 'historyCount',
    ]);
    expect(params.get('fields[customers]')?.split(',')).toEqual(['id', 'user_id', 'first_name', 'last_name', 'phone', 'email']);
    // Rien d'autre que le locataire n'est borné : `show` rend le bail entier.
    expect([...params.keys()].filter((k) => k.startsWith('fields['))).toEqual(['fields[customers]']);
  });

  it('sans l’option (l’onglet « Location » du bien), ni `tenant` ni `fields`', async () => {
    const { chemin, params } = await requeteDe(() => useLease(80));
    expect(chemin).toBe('/api/leases/80');
    expect(params.get('include')?.split(',')).toEqual(['property', 'landlord', 'agent']);
    expect([...params.keys()].some((k) => k.startsWith('fields['))).toBe(false);
  });
});
