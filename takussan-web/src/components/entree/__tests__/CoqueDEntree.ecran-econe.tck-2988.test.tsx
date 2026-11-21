/**
 * TCK-2988 — ce que la page déclare à la coque pour l'en-tête compact du téléphone (maquette « L'écran économe »,
 * validée le 2026-11-21) :
 *
 * - `sousTitre` : une ligne sous l'intention, dans la barre du téléphone ;
 * - `avancementAuPied` : la page porte l'avancement, la barre du téléphone n'a plus les pastilles (celle du bureau
 *   les garde) ;
 * - `effacerEnSortant` : un troisième geste dans la confirmation de sortie, qui efface PUIS part par le même lien ;
 *   le focus d'ouverture reste sur « Quitter ».
 *
 * Harnais de `CoqueDEntree.sortie-gardee.tck-2598.test.tsx`.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

describe('TCK-2988 — effacer en sortant', () => {
  it('un troisième geste : efface, PUIS part par le même lien ; le focus d’ouverture reste sur « Quitter »', async () => {
    const ordre: string[] = [];
    const effacer = vi.fn(async () => {
      ordre.push('effacé');
    });
    const { telephone } = monter({ saisie: true, reprise: 'Votre brouillon reste ici.', effacerEnSortant: { libelle: 'Effacer le brouillon', effacer } });
    fireEvent.click(within(telephone).getByRole('link', { name: C.fermer }));
    expect(clics).toEqual([{ href: '/', annule: true }]);

    const boite = screen.getByRole('dialog');
    const gestes = within(boite).getAllByRole('button').map((b) => b.textContent);
    // Dans l'ordre du document, « Effacer » vient après « Quitter » et « Rester » (vu en bas : `-order-1`).
    expect(gestes.indexOf('Effacer le brouillon')).toBeGreaterThan(gestes.indexOf(C.sortie.rester));
    expect(within(boite).getByRole('button', { name: 'Effacer le brouillon' })).toHaveClass('-order-1');

    window.addEventListener('click', () => ordre.push('parti'), { once: true });
    await act(async () => {
      fireEvent.click(within(boite).getByRole('button', { name: 'Effacer le brouillon' }));
    });
    expect(effacer).toHaveBeenCalledTimes(1);
    expect(clics.at(-1)).toEqual({ href: '/', annule: false });
    expect(ordre).toEqual(['effacé', 'parti']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sans `effacerEnSortant`, la confirmation garde ses deux gestes', () => {
    const { telephone } = monter({ saisie: true });
    fireEvent.click(within(telephone).getByRole('link', { name: C.fermer }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /effacer/i })).toBeNull();
  });
});
