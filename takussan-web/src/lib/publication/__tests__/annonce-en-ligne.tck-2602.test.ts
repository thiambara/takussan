import { describe, expect, it } from 'vitest';

import { etatDeLAnnonce } from '../annonce-en-ligne';

/**
 * TCK-2602 — l'écran « en ligne » ne sert que l'annonce d'un espace PARTICULIER : publique et visible
 * (`en-ligne`), ou en modération (`verification`). Tout autre bien retourne à sa fiche (`null`).
 */
const PARTICULIER = { id: 7, name: 'Awa Diop', slug: 'awa', logo_url: null, verified: false, rating: null, kind: 'individual' as const };
const BIEN = { status: 'available', visibility: 'public', slug: 'studio-mermoz', agency: PARTICULIER };

describe('TCK-2602 — etatDeLAnnonce', () => {
  it('un bien publié d’un espace particulier : en ligne', () => {
    expect(etatDeLAnnonce(BIEN)).toBe('en-ligne');
    expect(etatDeLAnnonce({ ...BIEN, status: 'published' })).toBe('en-ligne');
  });

  it('en modération : en vérification', () => {
    expect(etatDeLAnnonce({ ...BIEN, status: 'pending_review', visibility: 'private' })).toBe('verification');
  });

  it.each([
    ['agence standard', { ...BIEN, agency: { ...PARTICULIER, kind: 'standard' as const } }],
    ['agence illisible', { ...BIEN, agency: null }],
    ['sorte d’agence absente', { ...BIEN, agency: { ...PARTICULIER, kind: undefined } }],
    ['brouillon', { ...BIEN, status: 'draft' }],
    ['privé', { ...BIEN, visibility: 'private' }],
    ['loué', { ...BIEN, status: 'rented' }],
    ['sans slug', { ...BIEN, slug: '' }],
  ])('%s : la fiche (null)', (_cas, bien) => {
    expect(etatDeLAnnonce(bien)).toBeNull();
  });
});
