/**
 * TCK-2988 — ce que la page déclare à la coque pour l'en-tête compact du téléphone (maquette « L'écran économe »,
 * validée le 2026-11-21) :
 *
 * - `sousTitre` : une ligne sous l'intention, dans la barre du téléphone ;
 * - `avancementAuPied` : la page porte l'avancement, la barre du téléphone n'a plus les pastilles (celle du bureau
 *   les garde) ;
 * - `sortieAvecBrouillon` : le brouillon est gardé, la confirmation de sortie devient la feuille du bas de la
 *   maquette — « Reprendre plus tard » en tête (le focus y va), « Continuer la publication », puis « Effacer le
 *   brouillon », qui efface PUIS part par le même lien.
 *
 * Harnais de `CoqueDEntree.sortie-gardee.tck-2598.test.tsx`.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import { CoqueDEntree, DeclarerEntree, type DeclarationDEntree, type LibellesDeLaCoque } from '../CoqueDEntree';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/publish',
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

function monter(declaration: DeclarationDEntree) {
  render(
    withIntl(
      <CoqueDEntree libelles={LIBELLES} titre="Publier votre bien" sortie={{ href: '/', forme: 'quitter' }}>
        <DeclarerEntree pleinEcran pas={2} total={6} {...declaration} />
      </CoqueDEntree>,
    ),
  );
  const [telephone, bureau] = screen.getAllByRole('banner');
  return { telephone: telephone!, bureau: bureau! };
}

describe('TCK-2988 — la barre du téléphone', () => {
  it('sans déclaration : les pastilles, et pas de ligne sous l’intention', () => {
    const { telephone } = monter({});
    expect(within(telephone).getByRole('img', { name: 'Étape 2 sur 6' })).toBeInTheDocument();
    expect(telephone.querySelector('[data-sous-titre-d-entree]')).toBeNull();
  });

  it('`sousTitre` : une ligne sous l’intention', () => {
    const { telephone } = monter({ sousTitre: 'Studio · En location · Prix à venir' });
    const ligne = telephone.querySelector('[data-sous-titre-d-entree]');
    expect(ligne).toHaveTextContent('Studio · En location · Prix à venir');
    expect(ligne?.previousElementSibling).toHaveTextContent('Publier votre bien');
  });

  it('`avancementAuPied` : plus de pastilles au téléphone, celles du bureau restent', () => {
    const { telephone, bureau } = monter({ avancementAuPied: true });
    expect(within(telephone).queryByRole('img')).toBeNull();
    expect(within(bureau).getByRole('img', { name: 'Étape 2 sur 6' })).toBeInTheDocument();
  });

  it('`aDroite` à la place des pastilles : au ras du bord (`pr-1`), le geste porte sa propre marge', () => {
    const { telephone } = monter({ avancementAuPied: true, aDroite: { telephone: <button type="button">Aperçu</button>, bureau: null } });
    expect(within(telephone).getByRole('button', { name: 'Aperçu' }).parentElement).toHaveClass('pr-1');
  });
});

const SORTIE = {
  titre: 'Quitter la publication ?',
  texte: 'Votre brouillon reste gardé ici.',
  partir: 'Reprendre plus tard',
  rester: 'Continuer la publication',
};

describe('TCK-2988 — la sortie avec un brouillon gardé (feuille de la maquette)', () => {
  it('au téléphone, une feuille du bas : partir en tête, rester, puis effacer — et le focus sur partir', async () => {
    const { telephone } = monter({ saisie: true, sortieAvecBrouillon: { ...SORTIE, effacer: { libelle: 'Effacer le brouillon', effacer: vi.fn() } } });
    fireEvent.click(within(telephone).getByRole('link', { name: C.fermer }));
    expect(clics).toEqual([{ href: '/', annule: true }]);

    const feuille = screen.getByRole('dialog', { name: SORTIE.titre });
    expect(within(feuille).getByText(SORTIE.texte)).toBeInTheDocument();
    expect(within(feuille).getAllByRole('button').map((b) => b.textContent)).toEqual([SORTIE.partir, SORTIE.rester, 'Effacer le brouillon']);
    // Collée en bas, coins du haut arrondis, sans croix ; dialogue centré dès `sm`.
    expect(feuille).toHaveClass('max-sm:bottom-0', 'max-sm:top-auto', 'max-sm:rounded-t-3xl', 'max-sm:translate-y-0');
    expect(within(feuille).queryByRole('button', { name: /fermer|close/i })).toBeNull();
    // Gestes pleine largeur empilés au téléphone ; dès `sm`, partir à droite et effacer à gauche.
    expect(within(feuille).getByRole('button', { name: SORTIE.partir })).toHaveClass('max-sm:h-12', 'max-sm:rounded-full', 'sm:order-last');
    expect(within(feuille).getByRole('button', { name: SORTIE.rester })).toHaveClass('max-sm:h-12');
    expect(within(feuille).getByRole('button', { name: 'Effacer le brouillon' })).toHaveClass('text-destructive', 'sm:order-first', 'sm:mr-auto');
    await waitFor(() => expect(within(feuille).getByRole('button', { name: SORTIE.partir })).toHaveFocus());
  });

  it('« Reprendre plus tard » part par le même lien ; « Continuer la publication » reste', () => {
    const { telephone } = monter({ saisie: true, sortieAvecBrouillon: SORTIE });
    fireEvent.click(within(telephone).getByRole('link', { name: C.fermer }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: SORTIE.rester }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(clics).toHaveLength(1);

    fireEvent.click(within(telephone).getByRole('link', { name: C.fermer }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: SORTIE.partir }));
    expect(clics.at(-1)).toEqual({ href: '/', annule: false });
  });

  it('« Effacer le brouillon » efface, PUIS part par le même lien', async () => {
    const ordre: string[] = [];
    const effacer = vi.fn(async () => {
      ordre.push('effacé');
    });
    const { telephone } = monter({ saisie: true, sortieAvecBrouillon: { ...SORTIE, effacer: { libelle: 'Effacer le brouillon', effacer } } });
    fireEvent.click(within(telephone).getByRole('link', { name: C.fermer }));
    window.addEventListener('click', () => ordre.push('parti'), { once: true });
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Effacer le brouillon' }));
    });
    expect(effacer).toHaveBeenCalledTimes(1);
    expect(clics.at(-1)).toEqual({ href: '/', annule: false });
    expect(ordre).toEqual(['effacé', 'parti']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sans brouillon gardé, la confirmation d’avant : « Rester » en avant, et rien à effacer', () => {
    const { telephone } = monter({ saisie: true });
    fireEvent.click(within(telephone).getByRole('link', { name: C.fermer }));
    const boite = screen.getByRole('dialog', { name: C.sortie.titre });
    expect(boite).not.toHaveClass('max-sm:bottom-0');
    expect(within(boite).queryByRole('button', { name: /effacer/i })).toBeNull();
    expect(within(boite).getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining([C.sortie.partir, C.sortie.rester]));
  });
});
