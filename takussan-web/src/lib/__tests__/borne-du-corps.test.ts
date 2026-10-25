import { describe, expect, it } from 'vitest';

import {
  BORNE_DU_CORPS_OCTETS,
  PIECES_PAR_ENVOI_MAX_MO,
  PIECES_PAR_ENVOI_MAX_OCTETS,
  piecesDepassentLeCorps,
} from '../borne-du-corps';

const MIO = 1024 * 1024;

function piece(octets: number): File {
  const fichier = new File(['x'], 'piece.pdf', { type: 'application/pdf' });
  Object.defineProperty(fichier, 'size', { value: octets });
  return fichier;
}

/**
 * TCK-2330 (P222.05) — la somme des pièces d'un envoi, jugée sous la borne du proxy de l'API
 * (26 214 400 o, `takussan-api/docker/Caddyfile`) moins une marge pour les autres champs.
 */
describe('borne-du-corps', () => {
  it('la borne est celle du proxy, et la somme admise 24 Mio, une marge en dessous', () => {
    expect(BORNE_DU_CORPS_OCTETS).toBe(26_214_400);
    expect(PIECES_PAR_ENVOI_MAX_OCTETS).toBe(24 * MIO);
    expect(PIECES_PAR_ENVOI_MAX_MO).toBe(24);
  });

  it('24 Mio tout juste passent, un octet de plus ne passe pas', () => {
    expect(piecesDepassentLeCorps([piece(20 * MIO), piece(4 * MIO)])).toBe(false);
    expect(piecesDepassentLeCorps([piece(20 * MIO), piece(4 * MIO + 1)])).toBe(true);
    expect(piecesDepassentLeCorps([])).toBe(false);
  });
});
