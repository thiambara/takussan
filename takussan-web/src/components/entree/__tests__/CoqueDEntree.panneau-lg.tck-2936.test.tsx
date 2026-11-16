/**
 * TCK-2936 (suite de TCK-2604) — le panneau d'intention paraît dès 1024 px, plus seulement dès 1280 :
 * la maquette `app-entree-connexion` parle sous 1280 (`DeuxColonnes` en pourcentage, carte en
 * `max-lg:`), donc ADR-0106 § 4 s'efface devant elle. Avec un panneau, la barre de 64 px (à filet) n'est
 * jamais rendue : la barre sans filet de la colonne de droite la remplace, au-dessus d'un formulaire de
 * 400 px.
 *
 * jsdom n'applique pas Tailwind : `afficheA` (`@/test/affiche-a`) rejoue les utilitaires d'affichage
 * avec leurs préfixes `lg:` (1024) et `xl:` (1280), sur l'élément et ses ancêtres.
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

describe('le panneau d’intention, dès 1024 (TCK-2936)', () => {
  it.each([1024, 1279, 1440])('à %i, le panneau, la barre sans filet de la colonne de droite et le formulaire de 400 px', (largeur) => {
    const { container } = monter();
    const panneau = container.querySelector('[data-panneau-d-entree]')!;
    expect(afficheA(panneau, largeur)).toBe(true);
    expect(panneau.className).toMatch(/(^|\s)w-\[45%\](\s|$)/);

    const retours = screen.getAllByRole('link', { name: 'Retour à l’annonce' }).filter((lien) => afficheA(lien, largeur));
    expect(retours).toHaveLength(1);
    expect(retours[0]!.closest('header')!.className).not.toMatch(/(^|\s)border-b(\s|$)/);
    expect(screen.getByRole('form', { name: 'porte' }).parentElement!.className).toMatch(/(^|\s)lg:max-w-\[25rem\](\s|$)/);
  });

  it('avec un panneau, la barre de 64 px à filet n’est pas rendue du tout', () => {
    const { container } = monter();
    const barresAFilet = [...container.querySelectorAll('header')].filter((barre) => /(^|\s)h-16(\s|$)/.test(barre.className) && /(^|\s)border-b(\s|$)/.test(barre.className));
    expect(barresAFilet).toHaveLength(0);
  });

  it('sans panneau, la barre de 64 px reste celle du bureau', () => {
    const { container } = render(
      <CoqueDEntree libelles={LIBELLES} retourBureau={<NextLink href="/fr/properties/villa">Retour à l’annonce</NextLink>}>
        <form aria-label="porte">
          <input aria-label="numéro" />
        </form>
      </CoqueDEntree>,
    );
    expect(container.querySelector('[data-panneau-d-entree]')).toBeNull();
    const barre = screen.getByRole('link', { name: 'Retour à l’annonce' }).closest('header')!;
    expect(afficheA(barre, 1024)).toBe(true);
    expect(barre.className).toMatch(/(^|\s)border-b(\s|$)/);
    expect(screen.getByRole('form', { name: 'porte' }).parentElement!.className).toMatch(/(^|\s)max-w-\[30rem\](\s|$)/);
  });

  it('au téléphone (390), ni le panneau ni aucune des deux barres du bureau', () => {
    const { container } = monter();
    expect(afficheA(container.querySelector('[data-panneau-d-entree]')!, 390)).toBe(false);
    expect(screen.getAllByRole('link', { name: 'Retour à l’annonce' }).filter((lien) => afficheA(lien, 390))).toHaveLength(0);
  });
});

describe('le titre de la barre du bureau (`titreDeBureau`), sans panneau', () => {
  function monterAvecTitres() {
    return render(
      <CoqueDEntree libelles={LIBELLES} titre="Votre réservation" titreDeBureau="Votre réservation · Villa Almadies" sortie={{ href: '/', forme: 'quitter' }}>
        <p>contenu</p>
      </CoqueDEntree>,
    );
  }

  it('dès 1024, la barre de 64 px dit le titre du bureau ; au téléphone, le titre court', () => {
    monterAvecTitres();
    const titre = screen.getByText('Votre réservation · Villa Almadies');
    expect(afficheA(titre, 1024)).toBe(true);
    expect(titre.closest('header')!.className).toMatch(/(^|\s)h-16(\s|$)/);
    expect(afficheA(titre, 390)).toBe(false);
    expect(afficheA(screen.getByText('Votre réservation'), 390)).toBe(true);
  });
});
