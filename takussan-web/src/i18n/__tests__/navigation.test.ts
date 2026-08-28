import { describe, expect, it } from 'vitest';

import { hrefLocalise, localeDuChemin } from '../navigation';

/**
 * Le `href` d'un lien — ADR-0026.
 *
 * `hrefLocalise` est posé sans discernement sur des `href` que le même composant mélange (une carte
 * de bien vit à la fois sur le site public et dans la console). Les cas qui comptent ne sont donc
 * pas ceux qu'il transforme, mais ceux qu'il doit laisser INTACTS : une seule fausse
 * transformation — `mailto:`, `/app/…`, une ancre — casse un lien réel.
 */
describe('hrefLocalise', () => {
  it('préfixe un chemin public', () => {
    expect(hrefLocalise('/properties/x', 'en')).toBe('/en/properties/x');
    expect(hrefLocalise('/', 'wo')).toBe('/wo');
  });

  it('conserve la chaîne de requête et l’ancre', () => {
    expect(hrefLocalise('/properties?filter[city]=Dakar', 'en')).toBe(
      '/en/properties?filter[city]=Dakar',
    );
    expect(hrefLocalise('/properties/x#avis', 'wo')).toBe('/wo/properties/x#avis');
    expect(hrefLocalise('/properties/x?a=1#b', 'fr')).toBe('/fr/properties/x?a=1#b');
  });

  it('laisse INTACT tout ce qui n’est pas un chemin public', () => {
    for (const href of [
      'https://takussan.com/properties',
      '//cdn.example.com/x',
      'mailto:contact@takussan.com',
      'tel:+221770000000',
      '#section',
      'properties/x',
      '/app/overview',
      '/api/me/profiles',
      '/auth/login?redirect=%2Fapp',
      '/robots.txt',
    ]) {
      expect(hrefLocalise(href, 'en'), href).toBe(href);
    }
  });

  it('remplace une langue déjà écrite plutôt que d’en empiler une seconde', () => {
    expect(hrefLocalise('/fr/properties/x', 'wo')).toBe('/wo/properties/x');
  });
});

describe('localeDuChemin', () => {
  it('reconnaît la langue en tête de chemin', () => {
    expect(localeDuChemin('/en/properties')).toBe('en');
    expect(localeDuChemin('/wo')).toBe('wo');
  });

  it('rend null hors de la surface localisée', () => {
    expect(localeDuChemin('/app/overview')).toBeNull();
    expect(localeDuChemin('/properties/x')).toBeNull();
    expect(localeDuChemin('/')).toBeNull();
  });
});
