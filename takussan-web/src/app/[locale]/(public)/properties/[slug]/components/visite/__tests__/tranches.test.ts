/**
 * TCK-2503 — le jour et la tranche d'une demande de visite, jugés à DAKAR comme l'API les juge
 * (`TrancheDeVisite`, `VisitWindow::startOn`) : une tranche dont le début est passé est refusée,
 * le jour tient entre aujourd'hui et J+30 inclus.
 *
 * Le navigateur est forcé à Paris : un vert pris à UTC (= Dakar) ne distinguerait pas « 14:00 à
 * Dakar » de « 14:00 dans le navigateur ».
 */
process.env.TZ = 'Europe/Paris';

import { describe, expect, it } from 'vitest';
import {
  JOURS_OUVERTS,
  bornesDuCalendrier,
  chargeDeLaDemande,
  joursProposes,
  trancheEntamee,
  tranchesOuvertes,
} from '../tranches';

/** L'instant `HH:MM` à Dakar (UTC+0) le 12 novembre 2026. */
const aDakar = (heure: string) => new Date(`2026-11-12T${heure}:00Z`);

describe('tranches de visite (TCK-2503)', () => {
  it('une tranche est entamée dès son début à Dakar, pas avant', () => {
    expect(trancheEntamee('2026-11-12', 'afternoon', aDakar('13:59'))).toBe(false);
    expect(trancheEntamee('2026-11-12', 'afternoon', aDakar('14:00'))).toBe(true);
    expect(trancheEntamee('2026-11-12', 'morning', aDakar('08:59'))).toBe(false);
    expect(trancheEntamee('2026-11-12', 'morning', aDakar('09:00'))).toBe(true);
    expect(trancheEntamee('2026-11-12', 'evening', aDakar('16:59'))).toBe(false);
    expect(trancheEntamee('2026-11-12', 'evening', aDakar('17:00'))).toBe(true);
    // Un autre jour n'est jamais entamé par l'heure d'aujourd'hui.
    expect(trancheEntamee('2026-11-13', 'morning', aDakar('23:00'))).toBe(false);
  });

  it('à 15:00, seule la soirée reste ouverte aujourd’hui', () => {
    expect(tranchesOuvertes('2026-11-12', aDakar('15:00'))).toEqual(['evening']);
    expect(tranchesOuvertes('2026-11-13', aDakar('15:00'))).toEqual(['morning', 'afternoon', 'evening']);
  });

  it('trois jours proposés, à partir d’aujourd’hui tant qu’une tranche y reste', () => {
    expect(joursProposes(aDakar('16:59'))).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
  });

  it('après le début de la soirée, les jours proposés partent de demain', () => {
    expect(joursProposes(aDakar('17:00'))).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
  });

  it('le calendrier va d’aujourd’hui à J+30 inclus, comme l’API', () => {
    expect(JOURS_OUVERTS).toBe(30);
    expect(bornesDuCalendrier(aDakar('10:00'))).toEqual({ premier: '2026-11-12', dernier: '2026-12-12' });
    // Plus de tranche aujourd'hui : le calendrier commence demain, la borne haute ne bouge pas.
    expect(bornesDuCalendrier(aDakar('18:00'))).toEqual({ premier: '2026-11-13', dernier: '2026-12-12' });
  });

  it('la demande part en jour + tranche, sans heure', () => {
    expect(chargeDeLaDemande('2026-11-12', 'afternoon')).toEqual({ date: '2026-11-12', preferred_window: 'afternoon' });
    expect(chargeDeLaDemande('2026-11-12', 'afternoon')).not.toHaveProperty('scheduled_at');
  });
});
