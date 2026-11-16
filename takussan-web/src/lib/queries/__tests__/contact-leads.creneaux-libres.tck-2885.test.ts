/**
 * TCK-2885 — les deux créneaux du message prérempli : les deux premiers LIBRES des sept jours qui
 * viennent, jamais un pris ni un trop proche (délai de prévenance de 30 min), un jour lu seulement
 * tant qu'il en manque.
 */
import { describe, expect, it, vi } from 'vitest';

import { chercherCreneauxLibres } from '../contact-leads';
import type { CreneauDuServeur } from '@/lib/visites/planification';

/** Mardi 10 novembre 2026, 12:00 à Dakar (UTC). */
const MAINTENANT = new Date('2026-11-10T12:00:00Z');

const c = (jour: string, heure: string, available = true): CreneauDuServeur => ({ start: `${jour}T${heure}:00Z`, label: heure, available });

describe('chercherCreneauxLibres — TCK-2885', () => {
  it('saute les pris et ceux à moins de 30 min, va au jour suivant, et s’arrête à deux', async () => {
    const jours: Record<string, CreneauDuServeur[]> = {
      '2026-11-10': [c('2026-11-10', '12:00'), c('2026-11-10', '12:30', false)],
      '2026-11-11': [],
      '2026-11-12': [c('2026-11-12', '09:00', false), c('2026-11-12', '10:00')],
      '2026-11-13': [c('2026-11-13', '17:30'), c('2026-11-13', '18:00')],
    };
    const lire = vi.fn(async (jour: string) => jours[jour] ?? []);

    expect(await chercherCreneauxLibres(lire, MAINTENANT)).toEqual([
      { jour: '2026-11-12', heure: '10:00' },
      { jour: '2026-11-13', heure: '17:30' },
    ]);
    expect(lire.mock.calls.map(([j]) => j)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  });

  it('ne cherche pas au-delà de sept jours : aucun libre, aucun créneau', async () => {
    const lire = vi.fn(async (jour: string) => [c(jour, '10:00', false)]);
    expect(await chercherCreneauxLibres(lire, MAINTENANT)).toEqual([]);
    expect(lire).toHaveBeenCalledTimes(7);
    expect(lire.mock.calls.at(-1)?.[0]).toBe('2026-11-16');
  });

  it('un jour illisible arrête la recherche : on garde ce qu’on a', async () => {
    const lire = vi.fn(async (jour: string) => {
      if (jour === '2026-11-11') throw new Error('403');
      return [c(jour, '15:00')];
    });
    expect(await chercherCreneauxLibres(lire, MAINTENANT)).toEqual([{ jour: '2026-11-10', heure: '15:00' }]);
    expect(lire).toHaveBeenCalledTimes(2);
  });
});
