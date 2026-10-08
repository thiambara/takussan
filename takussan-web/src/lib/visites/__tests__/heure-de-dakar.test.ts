/**
 * TCK-590 AC10 — le navigateur est à Paris ; l'heure choisie est l'heure de Dakar.
 *
 * Le fuseau est forcé AVANT toute date : la précondition ci-dessous le vérifie, sans quoi un vert
 * pris dans un navigateur réglé sur UTC (Dakar, UTC+0) ne prouverait rien.
 */
process.env.TZ = 'Europe/Paris';

import { describe, expect, it } from 'vitest';
import { instantADakar, jourChoisi } from '../heure-de-dakar';

describe('heure de Dakar — navigateur à Europe/Paris', () => {
  it('le fuseau du test est bien Paris, hiver comme été', () => {
    expect(new Date(2026, 10, 12, 10, 0).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 5, 15, 10, 0).getTimezoneOffset()).toBe(-120);
  });

  it('10:00 le 2026-11-12 envoie 2026-11-12T10:00:00Z', () => {
    const cliqueDansLeCalendrier = new Date(2026, 10, 12);
    expect(instantADakar(jourChoisi(cliqueDansLeCalendrier), '10:00')).toBe('2026-11-12T10:00:00Z');
  });

  it('10:00 le 2026-06-15 (heure d’été à Paris) envoie 2026-06-15T10:00:00Z', () => {
    const cliqueDansLeCalendrier = new Date(2026, 5, 15);
    expect(instantADakar(jourChoisi(cliqueDansLeCalendrier), '10:00')).toBe('2026-06-15T10:00:00Z');
  });

  it('le calcul lit le décalage du fuseau visé, il ne suppose pas UTC', () => {
    expect(instantADakar('2026-11-12', '10:00', 'Europe/Paris')).toBe('2026-11-12T09:00:00Z');
    expect(instantADakar('2026-06-15', '10:00', 'Europe/Paris')).toBe('2026-06-15T08:00:00Z');
  });
});
