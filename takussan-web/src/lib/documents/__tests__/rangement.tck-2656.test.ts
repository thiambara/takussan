/**
 * TCK-2656 (lot 2) — « Rangé dans » : les dossiers où ranger, tirés des seules cibles de l'API.
 */
import { describe, expect, it } from 'vitest';

import { voirLeCoffre, type CoffreDeDocuments } from '../coffre';
import { cibleParDefaut, ciblesDeRangement, piecesARenouveler } from '../rangement';

const piece = (id: number, expiry: string | null) => ({
  kind: 'uploaded' as const,
  category: 'id_card',
  title: `Pièce ${id}`,
  date: '2026-01-01',
  download_path: `/api/documents/${id}`,
  targets: [{ type: 'user', id: 78 }],
  document_id: id,
  is_verified: null,
  expiry_date: expiry,
  versions_count: 0,
});

const COFFRE: CoffreDeDocuments = {
  folders: [
    { key: 'property:5', kind: 'property', target: { type: 'property', id: 5 }, name: 'Villa', year: null, read_only: false, entries: [] },
    {
      key: 'property:6',
      kind: 'property',
      target: { type: 'property', id: 6 },
      name: 'Studio',
      year: null,
      read_only: true,
      entries: [piece(40, '2026-11-15')],
    },
    {
      key: 'pieces',
      kind: 'pieces',
      target: { type: 'user', id: 78 },
      name: null,
      year: null,
      read_only: false,
      entries: [piece(41, '2026-12-01'), piece(42, '2026-11-01'), piece(43, null), piece(44, '2027-12-01')],
    },
  ],
  counts: { expiring_soon: 1, unverified: 0 },
  attachable_targets: [
    { type: 'property', id: 5, folder: 'property:5', name: 'Villa' },
    { type: 'lease', id: 30, folder: 'property:5', name: 'Villa', reference: 'LS-0DPA75TK' },
    // Un bail clos du même bien : son numéro le distingue.
    { type: 'lease', id: 29, folder: 'property:5', name: 'Villa', reference: 'LS-7OTZZUAM' },
    { type: 'property', id: 5, folder: 'property:5', name: 'Villa' },
    // L'API ne rend jamais la cible d'un dossier en lecture seule ; le module ne s'y fie pas.
    { type: 'property', id: 6, folder: 'property:6', name: 'Studio' },
    { type: 'customer', id: 9, folder: 'pieces', name: null },
    { type: 'user', id: 78, folder: 'pieces', name: null },
    // Un bien sans document n'a pas de dossier au coffre : il reste une cible.
    { type: 'property', id: 7, folder: 'property:7', name: 'Terrain' },
    { type: 'lease', id: 31, folder: 'property:7', name: 'Terrain', reference: null },
  ],
};

describe('TCK-2656 — ciblesDeRangement', () => {
  const cibles = ciblesDeRangement(COFFRE);

  it('dédoublonne, écarte la lecture seule et les types hors du coffre, garde le bien sans dossier', () => {
    expect(cibles.map((c) => c.cle)).toEqual(['property:5', 'lease:30', 'lease:29', 'user:78', 'property:7', 'lease:31']);
  });

  it('nomme le dossier comme le coffre, et distingue le bien de ses baux, et ses baux entre eux', () => {
    const de = (cle: string) => cibles.find((c) => c.cle === cle);
    expect(de('property:5')).toMatchObject({ etiquette: { cle: 'bien', nom: 'Villa' }, precision: { cle: 'leBien' } });
    expect(de('lease:30')).toMatchObject({ dossier: 'property:5', precision: { cle: 'leBail', reference: 'LS-0DPA75TK' } });
    expect(de('lease:29')).toMatchObject({ dossier: 'property:5', precision: { cle: 'leBail', reference: 'LS-7OTZZUAM' } });
    expect(de('user:78')).toMatchObject({ etiquette: { cle: 'mesPieces' }, precision: null });
    // Un bien sans dossier rendu : la précision se lit à la clé du dossier, pas à sa présence.
    expect(de('property:7')).toMatchObject({ etiquette: { cle: 'bien', nom: 'Terrain' }, precision: { cle: 'leBien' } });
    expect(de('lease:31')).toMatchObject({ precision: { cle: 'leBail', reference: null } });
  });

  it('« Mes pièces » est le rangement par défaut', () => {
    expect(cibleParDefaut(cibles)?.cle).toBe('user:78');
    expect(cibleParDefaut(cibles.filter((c) => c.type !== 'user'))?.cle).toBe('property:5');
    expect(cibleParDefaut([])).toBeNull();
  });
});

describe('TCK-2656 — piecesARenouveler', () => {
  it('les expirées et celles de la fenêtre, la plus pressée d’abord, hors lecture seule', () => {
    const vues = piecesARenouveler(voirLeCoffre(COFFRE, '2026-11-13'));
    expect(vues.map((v) => (v.geste.geste === 'ouvrir' ? v.geste.documentId : null))).toEqual([42, 41]);
  });
});
