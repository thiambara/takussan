import { describe, expect, it } from 'vitest';

import {
  SEGMENTS_NON_LOCALISES,
  analyserAcceptLanguage,
  cheminLocalise,
  decouperLocale,
  estCheminLocalisable,
  localeDeRepli,
} from '../routing';

/**
 * Le schéma d'URL de la langue — ADR-0026, TCK-434.
 *
 * ⚠ Ces cas sont écrits pour ÉCHOUER sur les régressions plausibles, pas pour décrire le code. Les
 * trois qui comptent, et ce qu'ils attrapent :
 *
 * · `/api/**` localisable → chaque route handler BFF part en 404, console comprise ;
 * · une URL déjà préfixée re-préfixée → `/fr/fr/properties`, un 404 sur tout le catalogue ;
 * · `localeDeRepli` qui préfère l'en-tête au cookie → un choix explicite écrasé (AC5).
 */
describe('estCheminLocalisable', () => {
  it('accepte les chemins de la surface publique', () => {
    for (const chemin of ['/', '/properties', '/properties/mon-slug', '/agencies/x', '/agents/y', '/compare']) {
      expect(estCheminLocalisable(chemin), chemin).toBe(true);
    }
  });

  it('refuse TOUTES les surfaces non localisées, une par une', () => {
    // Boucle sur la constante et non sur une liste recopiée : ajouter un segment sans le couvrir
    // ici deviendrait impossible.
    for (const segment of SEGMENTS_NON_LOCALISES) {
      expect(estCheminLocalisable(`/${segment}`), `/${segment}`).toBe(false);
      expect(estCheminLocalisable(`/${segment}/quelque/chose`), `/${segment}/…`).toBe(false);
    }
  });

  it('refuse les fichiers servis tels quels — sitemap et robots ne se déclinent pas', () => {
    for (const chemin of ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/og.png']) {
      expect(estCheminLocalisable(chemin), chemin).toBe(false);
    }
  });

  it('ne confond pas un préfixe avec un segment : /application n’est pas /app', () => {
    expect(estCheminLocalisable('/applications')).toBe(true);
    expect(estCheminLocalisable('/apiary')).toBe(true);
  });
});

describe('decouperLocale', () => {
  it('sépare la langue du reste', () => {
    expect(decouperLocale('/en/properties/x')).toEqual({ locale: 'en', chemin: '/properties/x' });
    expect(decouperLocale('/wo')).toEqual({ locale: 'wo', chemin: '/' });
    expect(decouperLocale('/fr/')).toEqual({ locale: 'fr', chemin: '/' });
  });

  it('rend null quand le premier segment n’est pas une langue connue', () => {
    expect(decouperLocale('/properties/x')).toEqual({ locale: null, chemin: '/properties/x' });
    // `zz` ressemble à une langue et n'en est pas une : c'est le cas que le layout transforme en 404.
    expect(decouperLocale('/zz/properties')).toEqual({ locale: null, chemin: '/zz/properties' });
  });
});

describe('cheminLocalise', () => {
  it('préfixe la surface publique, français compris — ADR-0026 §1', () => {
    expect(cheminLocalise('/properties/x', 'fr')).toBe('/fr/properties/x');
    expect(cheminLocalise('/properties/x', 'wo')).toBe('/wo/properties/x');
    expect(cheminLocalise('/', 'en')).toBe('/en');
  });

  it('REMPLACE une langue déjà présente — c’est ce dont dépend le commutateur', () => {
    expect(cheminLocalise('/fr/properties/x', 'en')).toBe('/en/properties/x');
    expect(cheminLocalise('/en', 'wo')).toBe('/wo');
  });

  it('est idempotent pour la même langue', () => {
    expect(cheminLocalise(cheminLocalise('/properties/x', 'en'), 'en')).toBe('/en/properties/x');
  });

  it('laisse les surfaces non localisées EXACTEMENT telles quelles', () => {
    expect(cheminLocalise('/app/overview', 'en')).toBe('/app/overview');
    expect(cheminLocalise('/api/me/profiles', 'wo')).toBe('/api/me/profiles');
    expect(cheminLocalise('/auth/login', 'fr')).toBe('/auth/login');
  });
});

describe('analyserAcceptLanguage', () => {
  it('trie par facteur q, pas par ordre d’apparition', () => {
    expect(analyserAcceptLanguage('fr;q=0.1, en;q=0.9')).toEqual(['en', 'fr']);
  });

  it('réduit à la sous-étiquette primaire', () => {
    expect(analyserAcceptLanguage('fr-CA,en-GB;q=0.8')).toEqual(['fr', 'en']);
  });
});

describe('localeDeRepli — où envoyer une requête SANS langue dans l’URL', () => {
  it('le cookie l’emporte sur un Accept-Language contradictoire (AC5)', () => {
    expect(localeDeRepli('en', 'fr-FR,fr;q=0.9')).toBe('en');
    expect(localeDeRepli('wo', 'en-US,en;q=0.9')).toBe('wo');
  });

  it('à défaut de cookie, suit Accept-Language', () => {
    expect(localeDeRepli(undefined, 'en-US,en;q=0.9')).toBe('en');
    expect(localeDeRepli(undefined, 'wo')).toBe('wo');
  });

  it('ignore un cookie qui ne nomme pas une langue connue', () => {
    expect(localeDeRepli('zz', 'en')).toBe('en');
  });

  it('sans cookie ni en-tête, rend le français', () => {
    expect(localeDeRepli(undefined, null)).toBe('fr');
    expect(localeDeRepli(undefined, undefined)).toBe('fr');
  });
});
