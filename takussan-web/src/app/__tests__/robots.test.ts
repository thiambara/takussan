import { describe, expect, it } from 'vitest';

import robots from '../robots';
import { ORIGINE_SITE } from '@/lib/alternates';

/**
 * TCK-431 · AC2 — `robots.txt` renvoie au sitemap et ferme les surfaces internes.
 *
 * Le test s'exerce sur l'objet que Next sérialise, pas sur une réponse HTTP : c'est le seul
 * artefact que le code de ce dépôt produise. Ce que Next en fait — `Disallow: <chemin>` par ligne,
 * `Sitemap: <url>` en fin de fichier — est figé par le sérialiseur du framework
 * (`resolve-route-data.js`), et le tester reviendrait à tester Next.
 */
describe('robots.txt', () => {
  const sortie = robots();

  it('déclare une directive Sitemap ABSOLUE', () => {
    // Un `Sitemap:` relatif n'est pas suivi. AC1 en dépend : sans cette ligne, le sitemap n'a
    // aucun chemin d'entrée depuis un moteur.
    expect(sortie.sitemap).toBe(`${ORIGINE_SITE}/sitemap.xml`);
    expect(String(sortie.sitemap)).toMatch(/^https?:\/\//);
  });

  const regles = Array.isArray(sortie.rules) ? sortie.rules : [sortie.rules!];
  const interdits = regles.flatMap((r) =>
    Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
  );

  it('s’adresse à tous les agents et autorise la racine', () => {
    expect(regles).toHaveLength(1);
    expect(regles[0]!.userAgent).toBe('*');
    expect(regles[0]!.allow).toBe('/');
  });

  it.each(['/app', '/admin', '/super-admin', '/api'])(
    'interdit %s — la disparition de l’un des quatre fait rougir',
    (chemin) => {
      expect(interdits).toContain(chemin);
    },
  );

  it.each(['/auth', '/onboarding', '/publish', '/maintenance'])(
    'interdit aussi %s',
    (chemin) => {
      expect(interdits).toContain(chemin);
    },
  );

  it('n’interdit ni /_next ni /_vercel — un moteur doit charger le CSS et le JS', () => {
    expect(interdits).not.toContain('/_next');
    expect(interdits).not.toContain('/_vercel');
  });

  it('n’interdit AUCUN chemin public, préfixé de langue ou non', () => {
    for (const public_ of ['/', '/fr', '/en/properties', '/wo/agencies/x', '/playground']) {
      const bloquant = interdits.find((i) => public_.startsWith(i));
      expect(bloquant, `« ${public_} » serait bloqué par « ${bloquant} »`).toBeUndefined();
    }
  });

  it('n’interdit pas /playground — sinon son `noindex` ne serait jamais lu', () => {
    // Les deux mécanismes ne s'additionnent pas : un moteur qui a l'interdiction de charger l'URL
    // ne voit pas le `robots: { index: false }` qu'elle porte, et peut l'indexer sans description
    // depuis un lien externe.
    expect(interdits).not.toContain('/playground');
  });
});
