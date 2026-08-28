/**
 * Les DONNÉES de navigation ne peuvent plus mentir — TCK-439 (AC4), TCK-437 (AC4).
 *
 * Deux entrées de `navLinks` portaient `href: '#'`, et le menu mobile les rendait comme des
 * liens : le panneau se refermait, la page ne bougeait pas. Un test qui vérifierait seulement
 * « les deux entrées fautives sont parties » cocherait aussi une régression qui en réintroduit
 * une troisième — c'est pourquoi il est écrit sur la FORME (`#`, une ancre nue, un chemin sans
 * page) et non sur les deux cas connus.
 *
 * L'inventaire de routes est DÉRIVÉ du système de fichiers (`src/test/routes-publiques.ts`) et
 * partagé avec TCK-436 : le jour où `/agencies` et `/agents` sont livrés, leurs liens cessent de
 * rougir sans qu'aucune liste soit mise à jour.
 */
import { describe, it, expect } from 'vitest';

import { navLinks, footerLinks } from '@/data/navigation';
import { MOTIFS_DE_ROUTE, routeExiste } from '@/test/routes-publiques';

const toutesLesEntrees = [
  ...navLinks.map((l) => ({ source: 'navLinks', ...l })),
  ...Object.entries(footerLinks).flatMap(([colonne, liens]) =>
    (liens as readonly { labelKey: string; href: string }[]).map((l) => ({
      source: `footerLinks.${colonne}`,
      ...l,
    })),
  ),
];

describe('données de navigation', () => {
  it("l'inventaire de routes est dérivé et non vide", () => {
    // Une garde qui n'a plus rien à trouver rend la même sortie verte qu'une garde satisfaite :
    // on vérifie donc d'abord que la dérivation a bien vu le dépôt.
    expect(MOTIFS_DE_ROUTE.length).toBeGreaterThan(20);
    expect(MOTIFS_DE_ROUTE).toContain('/properties');
    expect(MOTIFS_DE_ROUTE).toContain('/properties/[slug]');
    expect(MOTIFS_DE_ROUTE).toContain('/publish');
    // Les deux index que TCK-436 doit livrer n'existent pas encore : si cette assertion se met à
    // rougir, c'est qu'ils sont arrivés — brancher alors les deux entrées de
    // `footerLinks.professionnels` (cf. le commentaire de `src/data/navigation.ts`).
    expect(MOTIFS_DE_ROUTE).not.toContain('/agencies');
    expect(MOTIFS_DE_ROUTE).not.toContain('/agents');
  });

  it.each(toutesLesEntrees)(
    "$source/$labelKey ne porte pas d'ancre morte",
    ({ href }) => {
      expect(href).not.toBe('#');
      expect(href.startsWith('#')).toBe(false);
    },
  );

  it.each(toutesLesEntrees)(
    '$source/$labelKey mène à une route qui existe',
    ({ href }) => {
      expect(routeExiste(href), `href introuvable sous src/app : « ${href} »`).toBe(true);
    },
  );

  it('reconnaît les formes que la garde doit refuser', () => {
    // Mutation de la garde elle-même : sans ces cas, `routeExiste` pourrait rendre `true`
    // partout et les deux blocs ci-dessus resteraient verts.
    expect(routeExiste('#')).toBe(false);
    expect(routeExiste('#contact')).toBe(false);
    expect(routeExiste('')).toBe(false);
    expect(routeExiste('/agencies')).toBe(false); // TCK-436, pas encore livré
    expect(routeExiste('/services')).toBe(false); // l'entrée retirée par TCK-439
    expect(routeExiste('/a-propos')).toBe(false);
    expect(routeExiste('/properties/trop/de/segments')).toBe(false);
    // …et les formes qu'elle doit accepter.
    expect(routeExiste('/properties?contract_type=sale')).toBe(true);
    expect(routeExiste('/properties/villa-dakar')).toBe(true);
    expect(routeExiste('/fr/properties')).toBe(true); // déjà localisé : le proxy sert les deux
    expect(routeExiste('/publish')).toBe(true);
    expect(routeExiste('https://takussan.com')).toBe(true); // hors inventaire
    expect(routeExiste('mailto:contact@takussan.com')).toBe(true);
  });
});
