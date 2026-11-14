/**
 * TCK-2656 (lot 3) — le partage par lien, sans rendu : la charge utile, le plafond, le mot de passe,
 * l'URL distribuée, le message WhatsApp et la ligne d'expiration d'un lien actif.
 */
import { describe, expect, it } from 'vitest';

import {
  buildShareUrl,
  demandeDePartage,
  erreurDePartage,
  expirationDuLien,
  expireBientotAvecLHeure,
  lienWhatsApp,
  plafondSuivant,
  regleDExpiration,
} from '../partage';

const MAINTENANT = new Date('2026-11-13T10:00:00Z');

describe('TCK-2656 — le partage par lien', () => {
  it('7 jours, 3 téléchargements et un mot de passe : les trois valeurs partent', () => {
    expect(demandeDePartage({ duree: '7d', plafond: 3, protege: true, motDePasse: 'Sacre-Coeur' }, MAINTENANT)).toEqual({
      expires_at: '2026-11-20T10:00:00.000Z',
      max_downloads: 3,
      password: 'Sacre-Coeur',
    });
  });

  it('interrupteur éteint : aucun mot de passe ne part, même saisi ; « sans limite » n’envoie aucun plafond', () => {
    expect(demandeDePartage({ duree: '1h', plafond: null, protege: false, motDePasse: 'oublie-la' }, MAINTENANT)).toEqual({
      expires_at: '2026-11-13T11:00:00.000Z',
    });
  });

  it('chaque durée a son échéance', () => {
    expect(expirationDuLien('24h', MAINTENANT)).toBe('2026-11-14T10:00:00.000Z');
    expect(expirationDuLien('30d', MAINTENANT)).toBe('2026-12-13T10:00:00.000Z');
  });

  it('le compteur descend de 1 à « sans limite », et en remonte à 1', () => {
    expect(plafondSuivant(3, -1)).toBe(2);
    expect(plafondSuivant(1, -1)).toBeNull();
    expect(plafondSuivant(null, -1)).toBeNull();
    expect(plafondSuivant(null, 1)).toBe(1);
    expect(plafondSuivant(1000, 1)).toBe(1000);
  });

  it('protégé exige un mot de passe d’au moins 4 caractères (`min:4` de l’API)', () => {
    expect(erreurDePartage(true, '')).toBe('motDePasseVide');
    expect(erreurDePartage(true, 'abc')).toBe('motDePasseCourt');
    expect(erreurDePartage(true, 'abcd')).toBeNull();
    expect(erreurDePartage(false, '')).toBeNull();
  });

  it('l’URL est celle de la page de réception, jamais `/api/…`', () => {
    expect(buildShareUrl('a b')).toBe(`${window.location.origin}/share/a%20b`);
  });

  it('le message WhatsApp porte le texte donné, encodé', () => {
    expect(lienWhatsApp('Voici : https://x.test/share/t')).toBe('https://wa.me/?text=Voici%20%3A%20https%3A%2F%2Fx.test%2Fshare%2Ft');
  });

  it('la ligne d’un lien actif : aujourd’hui, dans n jours (7 au plus), puis la date — au jour de Dakar', () => {
    expect(regleDExpiration(null, MAINTENANT)).toEqual({ cle: 'sansExpiration' });
    expect(regleDExpiration('2026-11-13T23:30:00Z', MAINTENANT)).toEqual({ cle: 'aujourdhui', instant: '2026-11-13T23:30:00Z' });
    expect(regleDExpiration('2026-11-14T09:00:00Z', MAINTENANT)).toEqual({ cle: 'dans', jours: 1 });
    expect(regleDExpiration('2026-11-15T01:00:00Z', MAINTENANT)).toEqual({ cle: 'dans', jours: 2 });
    expect(regleDExpiration('2026-11-20T10:00:00Z', MAINTENANT)).toEqual({ cle: 'dans', jours: 7 });
    expect(regleDExpiration('2026-11-21T10:00:00Z', MAINTENANT)).toEqual({ cle: 'le', instant: '2026-11-21T10:00:00Z' });
  });

  it('« Valable jusqu’au » porte l’heure sous deux jours', () => {
    expect(expireBientotAvecLHeure('2026-11-14T10:00:00Z', MAINTENANT)).toBe(true);
    expect(expireBientotAvecLHeure('2026-11-20T10:00:00Z', MAINTENANT)).toBe(false);
  });
});
