import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { LeaseWithRelations } from '@/lib/queries/leases';

/**
 * TCK-2763 — l'onglet « Historique » de la fiche d'un bail dit QUI : « Loyer révisé · Awa Diop ».
 * L'API sert `causer: {id, name}` (`GET /api/audit-log/lease/{id}`), `null` pour un acte système :
 * l'onglet dit alors « Automatique ».
 */
const { REPONSE } = vi.hoisted(() => ({
  REPONSE: {
    data: {
      data: [
        {
          id: 1,
          event: 'lease_rent_reviewed',
          properties: { old_rent: 300_000, new_rent: 320_000 },
          created_at: '2026-11-03T10:00:00+00:00',
          causer: { id: 9, name: 'Awa Diop' },
        },
        { id: 2, event: 'lease_expired', properties: null, created_at: '2026-11-04T10:00:00+00:00', causer: null },
        { id: 3, event: 'updated', properties: null, created_at: '2026-11-05T10:00:00+00:00', causer: { id: 10, name: null } },
      ],
    },
    isError: false,
    isPending: false,
    refetch: () => {},
  },
}));

vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => REPONSE }));

import { OngletHistoriqueDuBail } from '../OngletsDuBail';

const bail = { id: 4, currency: 'XOF' } as unknown as LeaseWithRelations;
const ligne = (libelle: string) => screen.getByText(libelle).closest('li')!;
const texte = (el: Element) => (el.textContent ?? '').replace(/[  ]/g, ' ');

describe('OngletHistoriqueDuBail — l’auteur de chaque événement (TCK-2763)', () => {
  it('nomme l’auteur après le libellé de l’événement', () => {
    render(withIntl(<OngletHistoriqueDuBail lease={bail} />));

    expect(texte(ligne('Loyer révisé'))).toContain('Loyer révisé · Awa Diop');
  });

  it('un acte sans auteur se dit « Automatique »', () => {
    render(withIntl(<OngletHistoriqueDuBail lease={bail} />));

    expect(texte(ligne('Bail arrivé à son terme'))).toContain('Bail arrivé à son terme · Automatique');
  });

  it('un auteur sans nom ne se fait pas passer pour un acte système', () => {
    render(withIntl(<OngletHistoriqueDuBail lease={bail} />));

    expect(texte(ligne('Bail modifié'))).not.toContain('Automatique');
    expect(texte(ligne('Bail modifié'))).not.toContain(' · ');
  });
});
