import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl } from '@/test/intl';

// La chrome marketing tire `useRouter`/`useSearchParams`, qu'aucun routeur ne fournit sous jsdom.
// Ce que ces tests regardent est le CORPS de l'écran, pas la navbar — dont la présence, elle, est
// gardée par les tests de rendu serveur des fiches.
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));

import LoadingBookings from '../bookings/loading';
import NotFoundAgence from '../agencies/[slug]/not-found';
import NotFoundAgent from '../agents/[slug]/not-found';

/**
 * Les écrans d'état de la section publique — attente, introuvable, dictionnaire (TCK-438).
 *
 * L'AC3 exige que le repli soit constaté **par son rendu**, et non par la seule présence du
 * fichier : un `loading.tsx` qui exporterait `null` passerait un test d'existence et ne montrerait
 * rien. Les cas ci-dessous rendent donc les composants et comptent leurs squelettes.
 */

const squelettes = (c: HTMLElement) => c.querySelectorAll('[data-slot="skeleton"]');

describe("AC3 — l'état d'attente de /bookings", () => {
  it('rend un squelette, et pas un écran vide', () => {
    const { container } = render(<LoadingBookings />);

    expect(squelettes(container).length).toBeGreaterThan(5);
  });

  it("recopie la géométrie de la page : un en-tête puis deux colonnes", () => {
    // ⚠ Un squelette qui ne fait pas la forme de ce qui arrive déplace la mise en page à
    // l'arrivée des données — ce qui coûte plus cher que pas de squelette du tout (Direction UX
    // du ticket). L'assertion porte sur la structure, seule chose qu'un test puisse voir.
    const { container } = render(<LoadingBookings />);

    expect(container.querySelector('header')).not.toBeNull();
    expect(container.querySelector('aside')).not.toBeNull();
  });

  it("se retire de l'arbre d'accessibilité", () => {
    // Un squelette est du bruit pour un lecteur d'écran : il annonce des dizaines de boîtes vides.
    const { container } = render(<LoadingBookings />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe("AC1 — les écrans d'introuvable d'agence et d'agent", () => {
  it("l'agence introuvable dit qu'elle n'existe pas et rend la main vers le catalogue", () => {
    render(withIntl(<NotFoundAgence />));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Agence introuvable');
    expect(screen.getByRole('link', { name: 'Voir les annonces' })).toHaveAttribute(
      'href',
      '/fr/properties',
    );
  });

  it("l'agent introuvable de même", () => {
    render(withIntl(<NotFoundAgent />));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Agent introuvable');
    expect(screen.getByRole('link', { name: 'Voir les annonces' })).toHaveAttribute(
      'href',
      '/fr/properties',
    );
  });

  it('les deux écrans sont distincts — un seul libellé ne sert pas les deux', () => {
    // Non-vacuité : sans ce cas, une agence et un agent partageant le même texte passeraient les
    // deux tests ci-dessus, et un visiteur lirait « agence » sur la fiche d'un agent.
    expect(fr.agency.publicPage.notFoundTitle).not.toBe(fr.agents.publicPage.notFoundTitle);
    expect(fr.agency.publicPage.unavailableTitle).not.toBe(fr.agents.publicPage.unavailableTitle);
  });
});

/**
 * AC5 — **aucun libellé de ces écrans n'est écrit en dur.**
 *
 * ⚠ Un test qui ne regarderait que `fr.json` serait vert sur une clé absente d'`en` et de `wo` :
 * le repli de next-intl rendrait le français, et personne ne le verrait jamais rougir. Les trois
 * dictionnaires sont donc parcourus, et la chaîne vide est refusée au même titre que l'absence —
 * une clé déclarée vide est une clé manquante qui a appris à passer les tests.
 */
describe('AC5 — les libellés existent dans les trois dictionnaires', () => {
  const CHEMINS = [
    'errors.siteNotFound.eyebrow',
    'errors.siteNotFound.title',
    'errors.siteNotFound.body',
    'errors.siteNotFound.browseListings',
    'errors.siteNotFound.backHome',
    'errors.siteNotFound.footer',
    'agency.publicPage.notFoundTitle',
    'agency.publicPage.notFoundBody',
    'agency.publicPage.notFoundBrowse',
    'agency.publicPage.notFoundHome',
    'agency.publicPage.unavailableTitle',
    'agency.publicPage.unavailableBody',
    'agency.publicPage.unavailableMetaDescription',
    'agents.publicPage.notFoundTitle',
    'agents.publicPage.notFoundBody',
    'agents.publicPage.notFoundBrowse',
    'agents.publicPage.notFoundHome',
    'agents.publicPage.unavailableTitle',
    'agents.publicPage.unavailableBody',
    'agents.publicPage.unavailableMetaDescription',
  ] as const;

  const DICTIONNAIRES = { fr, en, wo } as Record<string, unknown>;

  const lis = (racine: unknown, chemin: string): unknown =>
    chemin
      .split('.')
      .reduce<unknown>(
        (n, c) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[c] : undefined),
        racine,
      );

  for (const langue of Object.keys(DICTIONNAIRES)) {
    it(`${langue} — les ${CHEMINS.length} clés sont présentes et non vides`, () => {
      const manquantes = CHEMINS.filter((chemin) => {
        const valeur = lis(DICTIONNAIRES[langue], chemin);
        return typeof valeur !== 'string' || valeur.trim() === '';
      });

      expect(manquantes).toEqual([]);
    });
  }
});
