import { describe, expect, it } from 'vitest';

import { avisOuvert, FENETRE_D_AVIS_HEURES, heuresRestantesPourLAvis } from '../fenetre-d-avis';

/**
 * TCK-2587 (lot C, reprise de la vérification) — la fenêtre d'avis du client : 24 h après la clôture,
 * jamais plus, et seulement pour une visite terminée.
 */
const MAINTENANT = Date.parse('2026-11-12T10:00:00Z');
const H = 3600 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('heuresRestantesPourLAvis', () => {
  it('une clôture datée dans le futur compte depuis maintenant : 24 h, jamais « encore 392 h »', () => {
    const visite = { status: 'completed' as const, completed_at: iso(MAINTENANT + 368 * H) };
    expect(heuresRestantesPourLAvis(visite, MAINTENANT)).toBe(FENETRE_D_AVIS_HEURES);
    expect(heuresRestantesPourLAvis({ ...visite, completed_at: iso(MAINTENANT + 5 * 60 * 1000) }, MAINTENANT)).toBe(24);
  });

  it('une clôture passée : l’heure entamée qui reste ; fermée au-delà de 24 h', () => {
    expect(heuresRestantesPourLAvis({ status: 'completed', completed_at: iso(MAINTENANT - 3 * H - 1) }, MAINTENANT)).toBe(21);
    expect(heuresRestantesPourLAvis({ status: 'completed', completed_at: iso(MAINTENANT - 25 * H) }, MAINTENANT)).toBeNull();
  });

  it('seule une visite TERMINÉE ouvre la fenêtre, même avec une date de clôture', () => {
    for (const status of ['scheduled', 'confirmed', 'cancelled', 'no_show'] as const) {
      expect(heuresRestantesPourLAvis({ status, completed_at: iso(MAINTENANT - H) }, MAINTENANT), status).toBeNull();
      expect(avisOuvert({ status, completed_at: iso(MAINTENANT - H) }, MAINTENANT), status).toBe(false);
    }
    expect(heuresRestantesPourLAvis({ status: 'completed', completed_at: null }, MAINTENANT)).toBeNull();
  });
});
