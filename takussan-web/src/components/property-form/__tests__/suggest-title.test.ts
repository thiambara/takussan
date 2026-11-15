import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';

import { suggestTitle } from '../wizard/suggest-title';
import type { TraducteurDeTitre } from '../wizard/suggest-title';

const tType = (cle: string) =>
  ({ land: 'Terrain', villa: 'Villa', apartment: 'Appartement', studio: 'Studio' })[cle] ?? cle;
// TCK-2833 — la phrase vient des gabarits du VRAI dictionnaire français.
const tTitre = createTranslator({ locale: 'fr', messages: fr, namespace: 'property.wizard' }) as unknown as TraducteurDeTitre;

describe('suggestTitle', () => {
  it('un terrain se décrit par sa surface et son quartier', () => {
    expect(suggestTitle({ type: 'land', area: 300, quarter: 'Almadies' }, tType, tTitre))
      .toBe('Terrain de 300 m² à Almadies');
  });

  it('un logement se décrit par ses chambres et son quartier', () => {
    expect(suggestTitle({ type: 'villa', bedrooms: 4, quarter: 'Ngor', area: 220 }, tType, tTitre))
      .toBe('Villa 4 chambres à Ngor');
  });

  it('replie sur la ville quand le quartier manque', () => {
    expect(suggestTitle({ type: 'apartment', bedrooms: 2, city: 'Thiès' }, tType, tTitre))
      .toBe('Appartement 2 chambres à Thiès');
  });

  it('accorde le pluriel de « chambre »', () => {
    expect(suggestTitle({ type: 'apartment', bedrooms: 1, city: 'Dakar' }, tType, tTitre))
      .toBe('Appartement 1 chambre à Dakar');
  });

  it('n’écrit que ce qu’il sait — jamais de segment vide ni de double espace', () => {
    expect(suggestTitle({ type: 'studio' }, tType, tTitre)).toBe('Studio');
    expect(suggestTitle({ type: 'studio', city: 'Dakar' }, tType, tTitre)).toBe('Studio à Dakar');
    expect(suggestTitle({ type: 'land', area: 500 }, tType, tTitre)).toBe('Terrain de 500 m²');
  });

  it('ne mentionne pas les chambres d’un terrain, même si la valeur traîne', () => {
    expect(suggestTitle({ type: 'land', bedrooms: 3, area: 400, city: 'Mbour' }, tType, tTitre))
      .toBe('Terrain de 400 m² à Mbour');
  });
});

/**
 * TCK-2833 — le titre se compose par les gabarits du dictionnaire, plus seulement le type. Le
 * traducteur est le RÉEL de next-intl, nourri des vrais dictionnaires : un double écrit à la main
 * ne verrait ni un pluriel faux ni une préposition oubliée.
 */
describe('suggestTitle — gabarits du dictionnaire (TCK-2833)', () => {
  const traducteurs = (locale: 'fr' | 'en' | 'wo') => {
    const messages = { fr, en, wo }[locale];
    return {
      tType: createTranslator({ locale, messages, namespace: 'property.types' }) as (c: string) => string,
      tTitre: createTranslator({ locale, messages, namespace: 'property.wizard' }) as unknown as TraducteurDeTitre,
    };
  };
  const enAnglais = (input: Parameters<typeof suggestTitle>[0]) => {
    const { tType, tTitre } = traducteurs('en');
    return suggestTitle(input, tType, tTitre);
  };
  const motsFrancais = /(^|\s)(de|à|chambres?)(\s|$)/i;

  it('AC1 — en anglais, un appartement de 60 m² à Bel Air ne garde aucun mot français', () => {
    const titre = enAnglais({ type: 'apartment', area: 60, quarter: 'Bel Air' });
    expect(titre).toContain('apartment');
    expect(titre).toContain('60 m²');
    expect(titre).toContain('Bel Air');
    expect(titre).not.toMatch(motsFrancais);
    expect(titre).toBe('60 m² apartment in Bel Air');
  });

  it('AC2 — en anglais, le nombre de chambres se dit à l’anglaise, au singulier comme au pluriel', () => {
    const un = enAnglais({ type: 'villa', bedrooms: 1, quarter: 'Ngor' });
    const trois = enAnglais({ type: 'villa', bedrooms: 3, quarter: 'Ngor' });
    expect(un).toBe('1-bedroom villa in Ngor');
    expect(trois).toBe('3-bedroom villa in Ngor');
    expect(un).not.toMatch(motsFrancais);
    expect(trois).not.toMatch(motsFrancais);
  });

  it('chaque type a son nom de milieu de phrase dans les trois langues', () => {
    for (const locale of ['fr', 'en', 'wo'] as const) {
      const { tType, tTitre } = traducteurs(locale);
      for (const type of Object.keys(en.property.types) as Parameters<typeof suggestTitle>[0]['type'][]) {
        const titre = suggestTitle({ type, area: 100, city: 'Dakar' }, tType, tTitre);
        expect(titre, `${locale} ${type}`).not.toMatch(/suggestedTitle|property\./);
      }
    }
  });

  it('en anglais, n’écrit que ce qu’il sait', () => {
    expect(enAnglais({ type: 'studio' })).toBe('Studio');
    expect(enAnglais({ type: 'studio', city: 'Dakar' })).toBe('Studio in Dakar');
    expect(enAnglais({ type: 'land', area: 500 })).toBe('500 m² plot');
  });

  it('en français, le vrai dictionnaire rend les titres d’avant au caractère près', () => {
    const { tType, tTitre } = traducteurs('fr');
    expect(suggestTitle({ type: 'land', area: 300, quarter: 'Almadies' }, tType, tTitre))
      .toBe('Terrain de 300 m² à Almadies');
    expect(suggestTitle({ type: 'villa', bedrooms: 4, quarter: 'Ngor', area: 220 }, tType, tTitre))
      .toBe('Villa 4 chambres à Ngor');
    expect(suggestTitle({ type: 'apartment', bedrooms: 1, city: 'Dakar' }, tType, tTitre))
      .toBe('Appartement 1 chambre à Dakar');
    expect(suggestTitle({ type: 'studio', city: 'Dakar' }, tType, tTitre)).toBe('Studio à Dakar');
  });

  it('ne formate pas les nombres selon la langue : une surface s’écrit comme avant', () => {
    const { tType, tTitre } = traducteurs('fr');
    expect(suggestTitle({ type: 'land', area: 1500, city: 'Mbour' }, tType, tTitre))
      .toBe('Terrain de 1500 m² à Mbour');
    expect(suggestTitle({ type: 'land', area: 60.5 }, tType, tTitre)).toBe('Terrain de 60.5 m²');
  });

  it('le wolof, en pause, porte le gabarit français', () => {
    const { tTitre } = traducteurs('wo');
    expect(suggestTitle({ type: 'land', area: 300, quarter: 'Almadies' }, () => 'Terrain', tTitre))
      .toBe('Terrain de 300 m² à Almadies');
  });
});
