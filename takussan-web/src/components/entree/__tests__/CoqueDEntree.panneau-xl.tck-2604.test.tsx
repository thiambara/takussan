/**
 * TCK-2604 (suite) — le panneau d'intention ne paraît qu'au bureau LARGE, dès 1280 px (« Bureau
 * (≥ 1280 px) » du ticket). Entre 1024 et 1280, la coque est celle d'une page sans panneau : la barre
 * de 64 px (avec `retourBureau`), la colonne de 480 px — aucun panneau à côté du contenu sous 1280
 * (AC-F6, ADR-0106 § 4).
 *
 * jsdom n'applique pas Tailwind : `afficheA` (`@/test/affiche-a`) rejoue les utilitaires d'affichage
 * avec leurs préfixes `lg:` (1024) et `xl:` (1280), sur l'élément et ses ancêtres. La mesure au
 * navigateur est au JSON de livraison.
 */
import { render, screen } from '@testing-library/react';
import NextLink from 'next/link';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { afficheA } from '@/test/affiche-a';

import { CoqueDEntree, type LibellesDeLaCoque } from '../CoqueDEntree';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/auth/login',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const C = frMessages.coqueDEntree;
const LIBELLES: LibellesDeLaCoque = {
  marque: 'Takussan',
  retourAuSite: C.retourAuSite,
  fermer: C.fermer,
  quitter: C.quitter,
  avancement: C.avancement,
  sortie: C.sortie,
};

function monter() {
  return render(
    <CoqueDEntree
      libelles={LIBELLES}
      panneau={<p>Villa Almadies — 450 000 F</p>}
      retourBureau={<NextLink href="/fr/properties/villa">Retour à l’annonce</NextLink>}
    >
      <form aria-label="porte">
        <input aria-label="numéro" />
      </form>
    </CoqueDEntree>,
  );
}

describe('le panneau d’intention, dès 1280 seulement', () => {
  it('à 1024, le panneau est absent et la barre de 64 px porte le retour et la marque', () => {
    const { container } = monter();
    const panneau = container.querySelector('[data-panneau-d-entree]')!;
    expect(panneau).not.toBeNull();
    expect(afficheA(panneau, 1024)).toBe(false);

    // Un seul retour affiché à 1024 : celui de la barre de 64 px, filet compris.
    const retours = screen.getAllByRole('link', { name: 'Retour à l’annonce' }).filter((lien) => afficheA(lien, 1024));
    expect(retours).toHaveLength(1);
    const barre = retours[0]!.closest('header')!;
    expect(barre.className).toMatch(/(^|\s)h-16(\s|$)/);
    expect(barre.className).toMatch(/(^|\s)border-b(\s|$)/);
    // La colonne : 480 px, pas les 400 px de la colonne voisine du panneau.
    const colonne = screen.getByRole('form', { name: 'porte' }).parentElement!;
    expect(colonne.className).toMatch(/(^|\s)max-w-\[30rem\](\s|$)/);
    expect(colonne.className).not.toMatch(/(^|\s)lg:max-w-\[25rem\](\s|$)/);
  });

  it('à 1280, le panneau paraît, avec la barre sans filet de la colonne de droite et le formulaire de 400 px', () => {
    const { container } = monter();
    expect(afficheA(container.querySelector('[data-panneau-d-entree]')!, 1280)).toBe(true);

    const retours = screen.getAllByRole('link', { name: 'Retour à l’annonce' }).filter((lien) => afficheA(lien, 1280));
    expect(retours).toHaveLength(1);
    expect(retours[0]!.closest('header')!.className).not.toMatch(/(^|\s)border-b(\s|$)/);
    expect(screen.getByRole('form', { name: 'porte' }).parentElement!.className).toMatch(/(^|\s)xl:max-w-\[25rem\](\s|$)/);
  });

  it('au téléphone (390), ni le panneau ni aucune des deux barres du bureau', () => {
    const { container } = monter();
    expect(afficheA(container.querySelector('[data-panneau-d-entree]')!, 390)).toBe(false);
    expect(screen.getAllByRole('link', { name: 'Retour à l’annonce' }).filter((lien) => afficheA(lien, 390))).toHaveLength(0);
  });
});

describe('le titre de la barre du bureau (`titreDeBureau`)', () => {
  function monterAvecTitres() {
    return render(
      <CoqueDEntree
        libelles={LIBELLES}
        titre="Votre réservation"
        titreDeBureau="Votre réservation · Villa Almadies"
        sortie={{ href: '/', forme: 'quitter' }}
        panneau={<p>Villa Almadies — 450 000 F</p>}
      >
        <p>contenu</p>
      </CoqueDEntree>,
    );
  }

  it('à 1024, la barre de 64 px dit l’action ET le bien ; à 1280, le panneau a pris le relais', () => {
    monterAvecTitres();
    const titre = screen.getByText('Votre réservation · Villa Almadies');
    expect(afficheA(titre, 1024)).toBe(true);
    expect(titre.closest('header')!.className).toMatch(/(^|\s)h-16(\s|$)/);
    expect(afficheA(titre, 1280)).toBe(false);
  });

  it('au téléphone, la barre garde le titre court', () => {
    monterAvecTitres();
    expect(afficheA(screen.getByText('Votre réservation · Villa Almadies'), 390)).toBe(false);
    expect(afficheA(screen.getByText('Votre réservation'), 390)).toBe(true);
  });
});
