/**
 * TCK-2598 (réserves r1, r2 de la contre-vérification de b055562f7) — TOUTES les sorties de la coque
 * passent par la confirmation quand une saisie est déclarée : « Retour au site », « ✕ », « Quitter »,
 * et la MARQUE (lien vers l'accueil, en tête de la barre au téléphone comme au bureau), qui sortait
 * sans demander. Un lien de sortie posé par la page dans son `enTete` emprunte la même garde
 * (`useClicDeSortie`). Et la saisie déclarée en deux endroits d'une page est un OU.
 */
import NextLink from 'next/link';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import { CoqueDEntree, DeclarerEntree, useClicDeSortie, type LibellesDeLaCoque } from '../CoqueDEntree';

// Un vrai `<a>` qui transmet `onClick` : la garde doit vivre sur le lien lui-même.
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

let clics: { href: string | null; annule: boolean }[] = [];
function enregistrer(evenement: MouseEvent) {
  const lien = (evenement.target as Element).closest('a');
  if (!lien) return;
  clics.push({ href: lien.getAttribute('href'), annule: evenement.defaultPrevented });
  evenement.preventDefault();
}
beforeEach(() => {
  clics = [];
  window.addEventListener('click', enregistrer);
});
afterEach(() => window.removeEventListener('click', enregistrer));

const marques = () => screen.getAllByRole('link', { name: 'Takussan' });

describe('r1 — la marque est une sortie gardée', () => {
  it('sans saisie, la marque sort directement', () => {
    render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
          <DeclarerEntree saisie={false} />
        </CoqueDEntree>,
      ),
    );
    // Téléphone (barre ouverte sur la marque) et bureau (en tête de barre).
    expect(marques()).toHaveLength(2);
    for (const marque of marques()) fireEvent.click(marque);
    expect(clics).toEqual([
      { href: '/', annule: false },
      { href: '/', annule: false },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('avec une saisie, chaque marque demande, dit où reprendre ; « Quitter » rejoue le clic sur la marque', () => {
    render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
          <DeclarerEntree saisie reprise="Votre prénom vous sera redemandé." />
        </CoqueDEntree>,
      ),
    );
    for (const [i, marque] of marques().entries()) {
      fireEvent.click(marque);
      expect(clics[i]).toEqual({ href: '/', annule: true });
      const boite = screen.getByRole('dialog');
      expect(within(boite).getByText('Votre prénom vous sera redemandé.')).toBeInTheDocument();
      fireEvent.click(within(boite).getByRole('button', { name: C.sortie.rester }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }

    fireEvent.click(marques()[0]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: C.sortie.partir }));
    expect(clics.at(-1)).toEqual({ href: '/', annule: false });
  });

  it('la marque de la barre du panneau (bureau large) et celle d’un retour : la même garde', () => {
    render(
      withIntl(
        <CoqueDEntree
          libelles={LIBELLES}
          sortie={{ href: '/', forme: 'retour-au-site' }}
          retour={{ telephone: <NextLink href="/fr/properties">retour</NextLink>, bureau: <NextLink href="/fr/properties">Retour au site public</NextLink> }}
          panneau={<p>panneau</p>}
        >
          <DeclarerEntree saisie />
        </CoqueDEntree>,
      ),
    );
    // Téléphone (après le retour), barre du panneau, barre de 1024-1280.
    expect(marques()).toHaveLength(3);
    for (const marque of marques()) {
      fireEvent.click(marque);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: C.sortie.rester }));
    }
    expect(clics.every((clic) => clic.annule)).toBe(true);
  });

  it('TCK-2601 — sortie bloquée : la marque reste inerte, saisie ou non, et n’ouvre rien', () => {
    render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
          <DeclarerEntree saisie sortieBloquee />
        </CoqueDEntree>,
      ),
    );
    for (const marque of marques()) {
      expect(marque).toHaveAttribute('aria-disabled', 'true');
      expect(marque).toHaveAttribute('tabindex', '-1');
      fireEvent.click(marque);
    }
    expect(clics.every((clic) => clic.annule)).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/** Un `enTete` de page avec sa propre marque : celle de l'écran du code de l'invitation. */
function EnTeteAvecMarque() {
  const clicDeSortie = useClicDeSortie();
  return (
    <header>
      <NextLink href="/" onClick={clicDeSortie}>
        Accueil
      </NextLink>
    </header>
  );
}

describe('r1 — un lien de sortie déclaré par la page (`useClicDeSortie`)', () => {
  it('sans saisie il sort ; avec une saisie il demande', () => {
    const { rerender } = render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
          <DeclarerEntree enTete={<EnTeteAvecMarque />} />
        </CoqueDEntree>,
      ),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Accueil' }));
    expect(clics).toEqual([{ href: '/', annule: false }]);

    rerender(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
          <DeclarerEntree enTete={<EnTeteAvecMarque />} saisie />
        </CoqueDEntree>,
      ),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Accueil' }));
    expect(clics.at(-1)).toEqual({ href: '/', annule: true });
    expect(within(screen.getByRole('dialog')).getByText(C.sortie.texte)).toBeInTheDocument();

    // « Quitter » rejoue le clic sur CE lien, par la garde prêtée (stable), cette fois sans le retenir.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: C.sortie.partir }));
    expect(clics.at(-1)).toEqual({ href: '/', annule: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hors de la coque, rien : le lien sort', () => {
    render(<EnTeteAvecMarque />);
    fireEvent.click(screen.getByRole('link', { name: 'Accueil' }));
    expect(clics).toEqual([{ href: '/', annule: false }]);
  });
});

describe('r2 — la saisie déclarée en deux endroits est un OU', () => {
  it('un `false` monté APRÈS un `true` ne l’efface pas', () => {
    render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
          <DeclarerEntree saisie />
          <DeclarerEntree saisie={false} />
        </CoqueDEntree>,
      ),
    );
    fireEvent.click(screen.getAllByRole('link', { name: C.retourAuSite })[0]);
    expect(clics).toEqual([{ href: '/', annule: true }]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
