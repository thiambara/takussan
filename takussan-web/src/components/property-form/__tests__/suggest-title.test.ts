import { describe, expect, it } from 'vitest';
import { suggestTitle } from '../wizard/suggest-title';

const tType = (cle: string) =>
  ({ land: 'Terrain', villa: 'Villa', apartment: 'Appartement', studio: 'Studio' })[cle] ?? cle;

describe('suggestTitle', () => {
  it('un terrain se décrit par sa surface et son quartier', () => {
    expect(suggestTitle({ type: 'land', area: 300, quarter: 'Almadies' }, tType))
      .toBe('Terrain de 300 m² à Almadies');
  });

  it('un logement se décrit par ses chambres et son quartier', () => {
    expect(suggestTitle({ type: 'villa', bedrooms: 4, quarter: 'Ngor', area: 220 }, tType))
      .toBe('Villa 4 chambres à Ngor');
  });

  it('replie sur la ville quand le quartier manque', () => {
    expect(suggestTitle({ type: 'apartment', bedrooms: 2, city: 'Thiès' }, tType))
      .toBe('Appartement 2 chambres à Thiès');
  });

  it('accorde le pluriel de « chambre »', () => {
    expect(suggestTitle({ type: 'apartment', bedrooms: 1, city: 'Dakar' }, tType))
      .toBe('Appartement 1 chambre à Dakar');
  });

  it('n’écrit que ce qu’il sait — jamais de segment vide ni de double espace', () => {
    expect(suggestTitle({ type: 'studio' }, tType)).toBe('Studio');
    expect(suggestTitle({ type: 'studio', city: 'Dakar' }, tType)).toBe('Studio à Dakar');
    expect(suggestTitle({ type: 'land', area: 500 }, tType)).toBe('Terrain de 500 m²');
  });

  it('ne mentionne pas les chambres d’un terrain, même si la valeur traîne', () => {
    expect(suggestTitle({ type: 'land', bedrooms: 3, area: 400, city: 'Mbour' }, tType))
      .toBe('Terrain de 400 m² à Mbour');
  });
});
