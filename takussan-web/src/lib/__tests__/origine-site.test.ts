import { describe, expect, it } from 'vitest';

import { ORIGINE_PRODUCTION, resoudreOrigineSite } from '../alternates';

/**
 * TCK-431 · AC5 — **l'hôte ne se devine pas, et son absence est bruyante.**
 *
 * Le contrat de la fonction est éprouvé sur ses ARGUMENTS et non sur `process.env` : muter
 * l'environnement de vitest ne changerait rien, `ORIGINE_SITE` étant résolue une fois à l'import
 * du module. C'est précisément pourquoi `resoudreOrigineSite` prend un objet — sans elle, la
 * branche « prévisualisation Vercel » ne serait éprouvable qu'en redéployant.
 */
describe('resoudreOrigineSite', () => {
  it('sans rien, rend l’origine MESURÉE de la production', () => {
    expect(resoudreOrigineSite({})).toBe(ORIGINE_PRODUCTION);
    expect(ORIGINE_PRODUCTION).toBe('https://www.takussan.com');
  });

  it('NEXT_PUBLIC_SITE_URL gagne sur tout le reste', () => {
    expect(
      resoudreOrigineSite({
        siteUrl: 'https://staging.takussan.test',
        vercelEnv: 'preview',
        vercelUrl: 'ignore.vercel.app',
      }),
    ).toBe('https://staging.takussan.test');
  });

  it('retire la barre finale plutôt que de produire une double barre', () => {
    expect(resoudreOrigineSite({ siteUrl: 'https://exemple.test/' })).toBe('https://exemple.test');
  });

  it('traite une valeur vide ou blanche comme ABSENTE', () => {
    // Le cas réel : `NEXT_PUBLIC_SITE_URL=` dans `.env.example`. Une chaîne vide qui l'emporterait
    // sur le défaut ferait sortir des URL commençant par « /fr », c'est-à-dire relatives.
    expect(resoudreOrigineSite({ siteUrl: '' })).toBe(ORIGINE_PRODUCTION);
    expect(resoudreOrigineSite({ siteUrl: '   ' })).toBe(ORIGINE_PRODUCTION);
  });

  describe('prévisualisation Vercel — le défaut de production y serait FAUX', () => {
    it('sert son propre hôte, schéma ajouté', () => {
      expect(resoudreOrigineSite({ vercelEnv: 'preview', vercelUrl: 'takussan-git-dev-x.vercel.app' })).toBe(
        'https://takussan-git-dev-x.vercel.app',
      );
    });

    it('n’ajoute pas un second schéma à une valeur déjà schématisée', () => {
      expect(resoudreOrigineSite({ vercelEnv: 'preview', vercelUrl: 'https://deja.vercel.app' })).toBe(
        'https://deja.vercel.app',
      );
    });

    it('en environnement `production`, garde le relevé et non l’hôte technique du déploiement', () => {
      // `VERCEL_URL` vaut aussi quelque chose en Production — l'hôte `*.vercel.app` du
      // déploiement, pas le domaine servi. S'en servir remplacerait `www.takussan.com` par un
      // alias technique dans TOUS les canonicals du site.
      expect(resoudreOrigineSite({ vercelEnv: 'production', vercelUrl: 'takussan-abc.vercel.app' })).toBe(
        ORIGINE_PRODUCTION,
      );
    });

    it('hors production ET sans hôte, ÉCHOUE en nommant la variable', () => {
      expect(() => resoudreOrigineSite({ vercelEnv: 'preview' })).toThrow(/NEXT_PUBLIC_SITE_URL/);
      // Et le message dit POURQUOI on n'a pas replié — c'est ce qui distingue un rouge utile
      // d'un rouge à contourner.
      expect(() => resoudreOrigineSite({ vercelEnv: 'preview' })).toThrow(/production/);
    });
  });

  describe('une valeur malformée ÉCHOUE plutôt que de produire des URL plausibles et fausses', () => {
    it('refuse une valeur sans schéma', () => {
      expect(() => resoudreOrigineSite({ siteUrl: 'www.takussan.com' })).toThrow(
        /NEXT_PUBLIC_SITE_URL/,
      );
    });

    it('refuse la chaîne « undefined », qu’un `.env` mal rempli produit littéralement', () => {
      expect(() => resoudreOrigineSite({ siteUrl: 'undefined' })).toThrow(/NEXT_PUBLIC_SITE_URL/);
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
