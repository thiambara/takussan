/**
 * TCK-2967 — les codes qui disent la fin d'une attente : la signature d'une partie, celle de toutes, la
 * visite annulée, et l'intervention annulée (rendue par son `data.status`, sans entrée propre).
 */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { withIntl } from '@/test/intl';
import type { MessageMetadata } from '@/types/message';

import { useTexteMessageSysteme } from '../useTexteMessageSysteme';

function dire(meta: MessageMetadata, locale: 'fr' | 'en' = 'fr'): string {
  const { result } = renderHook(() => useTexteMessageSysteme(), {
    wrapper: ({ children }: { children: ReactNode }) => withIntl(children, locale),
  });
  return result.current(meta);
}

const objet = (type: string) => ({ type, id: 4 });

describe('useTexteMessageSysteme — TCK-2967', () => {
  it('nomme la partie qui a signé l’état des lieux, par son code', () => {
    expect(dire({ object: objet('inventory'), code: 'inventory.signed_by_party', data: { type: 'move_in', party: 'tenant' } }))
      .toBe('Le locataire a signé l’état des lieux.');
    expect(dire({ object: objet('inventory'), code: 'inventory.signed_by_party', data: { type: 'move_in', party: 'landlord' } }))
      .toBe('Le bailleur a signé l’état des lieux.');
    expect(dire({ object: objet('inventory'), code: 'inventory.signed_by_party', data: { type: 'move_in' } }))
      .toBe('Une partie a signé l’état des lieux.');
    expect(dire({ object: objet('inventory'), code: 'inventory.signed_by_party', data: { party: 'tenant' } }, 'en'))
      .toBe('The tenant signed the inspection.');
  });

  it('dit l’état des lieux signé par tous et la visite annulée', () => {
    expect(dire({ object: objet('inventory'), code: 'inventory.signed', data: { type: 'move_out' } }))
      .toBe('L’état des lieux est signé par toutes les parties.');
    expect(dire({ object: objet('property_visit'), code: 'visit.cancelled', data: {} })).toBe('La visite a été annulée.');
  });

  it('l’intervention annulée se lit par son statut, jamais par le libellé générique', () => {
    const texte = dire({ object: objet('maintenance_request'), code: 'maintenance.cancelled', data: { status: 'cancelled', from: 'open' } });
    expect(texte).not.toBe(dire({ object: objet('maintenance_request'), code: 'maintenance.inconnu', data: {} }));
    expect(texte).toMatch(/annul/i);
  });
});
