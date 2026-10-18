import { describe, expect, it } from 'vitest';

import { ORIGINE_PRODUCTION, resoudreOrigineSite } from '../alternates';

/**
 * TCK-431 · AC5 — **l'hôte ne se devine pas, et son absence est bruyante.**
 *
 * Le contrat de la fonction est éprouvé sur ses ARGUMENTS. La lecture de l'environnement par
 * `origineSite()` est éprouvée dans `config-publique.test.ts`.
 */
describe('resoudreOrigineSite', () => {
  it('sans rien, rend l’origine MESURÉE de la production', () => {
    expect(resoudreOrigineSite({})).toBe(ORIGINE_PRODUCTION);
    expect(ORIGINE_PRODUCTION).toBe('https://www.takussan.com');
  });

  it('SITE_URL gagne sur le défaut', () => {
    expect(resoudreOrigineSite({ siteUrl: 'https://staging.takussan.test' })).toBe('https://staging.takussan.test');
  });

  it('retire la barre finale plutôt que de produire une double barre', () => {
    expect(resoudreOrigineSite({ siteUrl: 'https://exemple.test/' })).toBe('https://exemple.test');
  });

  it('traite une valeur vide ou blanche comme ABSENTE', () => {
    // Le cas réel : `SITE_URL=` dans `.env.example`. Une chaîne vide qui l'emporterait
    // sur le défaut ferait sortir des URL commençant par « /fr », c'est-à-dire relatives.
    expect(resoudreOrigineSite({ siteUrl: '' })).toBe(ORIGINE_PRODUCTION);
    expect(resoudreOrigineSite({ siteUrl: '   ' })).toBe(ORIGINE_PRODUCTION);
  });

  describe('une valeur malformée ÉCHOUE plutôt que de produire des URL plausibles et fausses', () => {
    it('refuse une valeur sans schéma', () => {
      expect(() => resoudreOrigineSite({ siteUrl: 'www.takussan.com' })).toThrow(/SITE_URL/);
    });

    it('refuse la chaîne « undefined », qu’un `.env` mal rempli produit littéralement', () => {
      expect(() => resoudreOrigineSite({ siteUrl: 'undefined' })).toThrow(/SITE_URL/);
    });

    it('refuse un schéma non servi', () => {
      expect(() => resoudreOrigineSite({ siteUrl: 'ftp://exemple.test' })).toThrow(/http/);
    });

    it('refuse un CHEMIN de base — il serait recopié devant chaque URL du site', () => {
      expect(() => resoudreOrigineSite({ siteUrl: 'https://exemple.test/site' })).toThrow(/chemin/);
      expect(() => resoudreOrigineSite({ siteUrl: 'https://exemple.test/?a=1' })).toThrow(/chemin/);
    });

    it('garde le PORT, qui fait partie de l’origine', () => {
      expect(resoudreOrigineSite({ siteUrl: 'http://localhost:3000' })).toBe('http://localhost:3000');
    });
  });
});
