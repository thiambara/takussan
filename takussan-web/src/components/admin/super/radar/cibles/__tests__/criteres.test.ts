import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { formatteursPour } from '@/lib/format/useFormatteurs';
import type { RadarTargetCriteria } from '@/types/radar';
import { ERREURS_CIBLES_RADAR } from '../../codes-radar';
import { BROUILLON_VIDE, CLES_DE_CRITERE, critereDuChamp, criteresDe, memesCriteres, morceauxDuResume, nombreSaisi } from '../criteres';

const VIDES: RadarTargetCriteria = criteresDe(BROUILLON_VIDE);

/** Un traducteur qui lit le dictionnaire français, interpolation simple comprise. */
function traducteur(espace: Record<string, unknown>) {
  return (cle: string, valeurs: Record<string, string | number> = {}) => {
    const brut = cle.split('.').reduce<unknown>((noeud, segment) => (noeud as Record<string, unknown>)?.[segment], espace);
    if (typeof brut !== 'string') throw new Error(`clé absente : ${cle}`);
    return brut.replace(/\{(\w+)\}/g, (_tout, nom: string) => String(valeurs[nom] ?? ''));
  };
}

const outils = {
  t: traducteur(fr.superAdmin.pages.radar.targets),
  tTypes: traducteur(fr.property.types),
  tSites: traducteur(fr.superAdmin.pages.radar.sites),
  fmt: formatteursPour('fr'),
};

describe('Les critères d\'une cible (TCK-2469)', () => {
  it('le résumé se lit comme on décrit un bien : type, transaction, lieux, prix, chambres', () => {
    const criteres: RadarTargetCriteria = {
      ...VIDES,
      types: ['apartment'],
      contract: 'rent',
      neighborhoods: [{ name: 'Almadies', city: 'Dakar' }, { name: 'Ngor', city: 'Dakar' }],
      price_min: 300000,
      price_max: 700000,
      bedrooms_min: 2,
      bedrooms_max: 3,
    };
    const morceaux = morceauxDuResume(criteres, outils);
    expect(morceaux[0]).toBe('Appartement');
    expect(morceaux[1]).toBe('location');
    expect(morceaux[2]).toBe('Almadies, Ngor');
    expect(morceaux[3]).toMatch(/^300\s000\sF\sCFA – 700\s000\sF\sCFA$/u);
    expect(morceaux[4]).toBe('2-3 ch.');
  });

  it('une borne seule, le meublé, les sites et la fraîcheur se disent aussi', () => {
    const morceaux = morceauxDuResume(
      { ...VIDES, price_max: 500000, bedrooms_min: 2, furnished: false, sites: ['expat_dakar'], max_age_days: 30 },
      outils,
    );
    expect(morceaux).toEqual([
      expect.stringMatching(/^jusqu’à 500\s000\sF\sCFA$/u),
      '2 ch. et plus',
      'non meublé',
      'Expat-Dakar',
      'moins de 30 j',
    ]);
  });

  it('aucun critère : aucun morceau', () => {
    expect(morceauxDuResume(VIDES, outils)).toEqual([]);
  });

  it('le brouillon part avec toutes les clés ; un champ vide vaut null, une saisie non entière part telle quelle', () => {
    const criteres = criteresDe({ ...BROUILLON_VIDE, priceMin: '300 000', bedroomsMax: '', maxAgeDays: '1,5' });
    expect(Object.keys(criteres)).toEqual([...CLES_DE_CRITERE]);
    expect(criteres.price_min).toBe(300000);
    expect(criteres.bedrooms_max).toBeNull();
    expect(nombreSaisi('1,5')).toBe('1,5');
  });

  it('deux jeux égaux à l\'ordre des listes près sont les mêmes critères', () => {
    expect(memesCriteres({ ...VIDES, types: ['villa', 'house'] }, { ...VIDES, types: ['house', 'villa'] })).toBe(true);
    expect(memesCriteres({ ...VIDES, types: ['villa'] }, { ...VIDES, types: ['house'] })).toBe(false);
  });

  it('le chemin d\'un refus nomme son critère', () => {
    expect(critereDuChamp('criteria.neighborhoods.1.name')).toBe('neighborhoods');
    expect(critereDuChamp('criteria.price_min')).toBe('price_min');
    expect(critereDuChamp('criteria.inconnu')).toBeNull();
    expect(critereDuChamp(undefined)).toBeNull();
  });

  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque code `radar.targets.*` et chaque critère a son libellé en %s', (_langue, messages) => {
    const cibles = messages.superAdmin.pages.radar.targets;
    for (const cle of Object.values(ERREURS_CIBLES_RADAR)) expect((cibles.errors as Record<string, string>)[cle], cle).toBeTruthy();
    for (const cle of CLES_DE_CRITERE) expect((cibles.fields as Record<string, string>)[cle], cle).toBeTruthy();
  });
});
