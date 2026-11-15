/**
 * TCK-2656 (lot 3) — la fiche d'un document, sans rendu.
 */
import { describe, expect, it } from 'vitest';

import { estUneImage, formatDuFichier, seVersionne, tailleDuFichier } from '../fiche';

const droits = { update: true, share: true, delete: true };

describe('TCK-2656 — la fiche d’un document', () => {
  it('une nouvelle version suit `abilities.update`, sauf une pièce de profil, que l’API refuse en 422', () => {
    expect(seVersionne({ abilities: droits, type: 'id_card', documentable_type: 'App\\Models\\User' })).toBe(true);
    expect(seVersionne({ abilities: droits, type: 'id_card', documentable_type: 'App\\Models\\OwnerProfile' })).toBe(false);
    expect(seVersionne({ abilities: droits, type: 'rib', documentable_type: 'App\\Models\\AgentProfile' })).toBe(false);
    expect(seVersionne({ abilities: droits, type: 'insurance', documentable_type: 'App\\Models\\OwnerProfile' })).toBe(true);
    expect(seVersionne({ abilities: { ...droits, update: false }, type: 'other', documentable_type: 'App\\Models\\Lease' })).toBe(false);
    expect(seVersionne({ abilities: undefined, type: null, documentable_type: 'App\\Models\\Lease' })).toBe(false);
  });

  it('le format vient de l’extension, à défaut du type MIME', () => {
    expect(formatDuFichier('cni.jpg', 'image/jpeg')).toBe('JPG');
    expect(formatDuFichier('scan', 'application/pdf')).toBe('PDF');
    expect(formatDuFichier(null, 'image/svg+xml')).toBe('SVG');
    expect(formatDuFichier(null, null)).toBeNull();
  });

  it('la taille en Mo dès 1 Mo (une décimale), en Ko sinon', () => {
    expect(tailleDuFichier(2.4 * 1024 * 1024)).toEqual({ unite: 'Mo', valeur: 2.4 });
    expect(tailleDuFichier(300)).toEqual({ unite: 'Ko', valeur: 1 });
    expect(tailleDuFichier(null)).toBeNull();
  });

  it('seule une image s’affiche en aperçu', () => {
    expect(estUneImage('image/png')).toBe(true);
    expect(estUneImage('application/pdf')).toBe(false);
    expect(estUneImage(null)).toBe(false);
  });
});
