/** TCK-2786 — les clés du journal et l'état de « Relancer le bailleur », sans rendu. */
import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';
import { relanceDuBailleur } from '@/lib/maintenance/files';
import { CLES_DU_JOURNAL, cleDuJournal } from '@/lib/maintenance/journal';

const MAINTENANT = new Date('2026-11-13T10:30:00Z');

describe('cleDuJournal', () => {
  it('chaque code de l’API a son libellé, un code inconnu se dit « Étape »', () => {
    expect(cleDuJournal('status.quote_awaiting_owner')).toBe('status_quote_awaiting_owner');
    expect(cleDuJournal('journal.before')).toBe('journal_before');
    expect(cleDuJournal('owner_reminded')).toBe('owner_reminded');
    expect(cleDuJournal('status.inconnu')).toBe('autre');
    for (const cle of [...CLES_DU_JOURNAL, 'autre'] as const) {
      expect(fr.maintenance.journal.codes[cle], cle).toBeTruthy();
    }
  });
});

describe('relanceDuBailleur', () => {
  it('jamais relancé : possible', () => {
    expect(relanceDuBailleur({ owner_reminded_at: null }, MAINTENANT)).toEqual({ etat: 'possible' });
    expect(relanceDuBailleur({}, MAINTENANT)).toEqual({ etat: 'possible' });
  });
  it('dans les 24 h : relancé, avec la durée écoulée', () => {
    expect(relanceDuBailleur({ owner_reminded_at: '2026-11-13T08:30:00Z' }, MAINTENANT)).toEqual({ etat: 'relance', duree: { n: 2, unite: 'hour' } });
    expect(relanceDuBailleur({ owner_reminded_at: '2026-11-12T10:31:00Z' }, MAINTENANT).etat).toBe('relance');
  });
  it('24 h pile après : de nouveau possible (la règle de l’API)', () => {
    expect(relanceDuBailleur({ owner_reminded_at: '2026-11-12T10:30:00Z' }, MAINTENANT)).toEqual({ etat: 'possible' });
  });
});
