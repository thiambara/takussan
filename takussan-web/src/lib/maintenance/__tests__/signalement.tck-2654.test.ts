import { describe, expect, it } from 'vitest';

import { PERSONAS } from '@/lib/navigation/personas';
import { ajouterPhotos, corpsDuSignalement, etapesFaites, formulaireDuSignalement } from '../signalement';

describe('signalement du locataire — TCK-2654', () => {
  it('seul le persona locataire a le formulaire photo d’abord', () => {
    expect(PERSONAS.filter((p) => formulaireDuSignalement(p) === 'locataire')).toEqual(['locataire']);
  });

  it('une description vide ou blanche n’est pas envoyée ; sinon, rognée', () => {
    const base = { propertyId: 44, leaseId: 5, categorie: 'plumbing' as const, urgence: null, titre: 'Problème d’eau' };
    expect(corpsDuSignalement({ ...base, texte: '   ' })).not.toHaveProperty('description');
    expect(corpsDuSignalement({ ...base, texte: ' fuite ' }).description).toBe('fuite');
    expect(corpsDuSignalement({ ...base, texte: '' }).priority).toBe('normal');
    expect(corpsDuSignalement({ ...base, texte: '', urgence: 'urgent' }).priority).toBe('urgent');
    expect(corpsDuSignalement({ ...base, texte: '', urgence: 'attendre' }).priority).toBe('normal');
  });

  it('les photos s’ajoutent jusqu’à la borne, le reste est compté', () => {
    expect(ajouterPhotos([1, 2], [3, 4, 5], 4)).toEqual({ photos: [1, 2, 3, 4], refusees: 1 });
    expect(ajouterPhotos([1, 2, 3, 4], [5], 4)).toEqual({ photos: [1, 2, 3, 4], refusees: 1 });
    expect(ajouterPhotos([], [1], 4)).toEqual({ photos: [1], refusees: 0 });
  });

  it('les étapes faites suivent le statut', () => {
    expect(etapesFaites('open')).toBe(1);
    expect(etapesFaites('quote_requested')).toBe(1);
    expect(etapesFaites('assigned')).toBe(2);
    expect(etapesFaites('in_progress')).toBe(2);
    expect(etapesFaites('completed')).toBe(3);
    expect(etapesFaites('closed')).toBe(4);
  });
});
