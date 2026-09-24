import { describe, expect, it } from 'vitest';

import { fusionnerRestauration } from '../restauration';

/** TCK-561 — « Annuler » après « Vider » ne jette jamais un choix du visiteur en silence. */
const a = (titre: string) => ({ title: titre, slug: titre, photo: null });

describe('fusionnerRestauration', () => {
  it('rien d’ajouté entre-temps : l’instantané revient tel quel', () => {
    const r = fusionnerRestauration({ ids: [1, 2], previews: { 1: a('un'), 2: a('deux') } }, { ids: [], previews: {} });
    expect(r).toEqual({ ids: [1, 2], previews: { 1: a('un'), 2: a('deux') }, ecartes: [] });
  });

  it('un ajout entre-temps est gardé, après l’instantané, avec son aperçu', () => {
    const r = fusionnerRestauration({ ids: [1, 2], previews: { 1: a('un') } }, { ids: [3], previews: { 3: a('trois') } });
    expect(r.ids).toEqual([1, 2, 3]);
    expect(r.previews).toEqual({ 1: a('un'), 3: a('trois') });
    expect(r.ecartes).toEqual([]);
  });

  it('un bien ré-ajouté entre-temps n’est pas compté deux fois et garde sa place d’origine', () => {
    const r = fusionnerRestauration({ ids: [1, 2, 3], previews: {} }, { ids: [2, 9], previews: {} });
    expect(r.ids).toEqual([1, 2, 3, 9]);
    expect(r.ecartes).toEqual([]);
  });

  it('au-delà du plafond : la sélection courante gagne, le reste de l’instantané est rendu', () => {
    const r = fusionnerRestauration({ ids: [1, 2, 3, 4], previews: {} }, { ids: [7, 8], previews: {} });
    expect(r.ids).toEqual([1, 2, 7, 8]);
    expect(r.ecartes).toEqual([3, 4]);
  });
});
