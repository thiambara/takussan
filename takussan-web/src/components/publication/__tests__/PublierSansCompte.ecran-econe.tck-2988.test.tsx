/**
 * TCK-2988 — `/publish` au téléphone, en-tête et brouillon compacts (maquette « L'écran économe », validée le
 * 2026-11-21) — monté DANS la coque d'entrée, qui rend ce que la page lui déclare :
 *
 * - la barre du téléphone n'a plus les pastilles (le pied porte l'avancement) ;
 * - dès la deuxième étape, elle dit le résumé de l'annonce sous l'intention, et porte « Aperçu » — la barre
 *   d'aperçu sous l'en-tête n'est plus rendue ;
 * - la ligne d'état du brouillon ne paraît plus au téléphone (`hidden lg:flex`), sauf l'avertissement du
 *   navigateur qui ne garde rien ;
 * - un brouillon repris s'annonce en une ligne au téléphone, avec « Effacer », à la place de « Nous avons repris… » ;
 * - avec un brouillon, ✕ demande, et « Effacer le brouillon » le vide avant de partir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { moteurEnMemoire, ouvrirBrouillonLocal, type MoteurDeStockage } from '@/lib/publication/brouillon-local';
import { CoqueDEntree, type LibellesDeLaCoque } from '@/components/entree/CoqueDEntree';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur, usePathname: () => '/publish', useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({ LocationPickerMapLoader: () => <div data-testid="carte" /> }));
vi.mock('@/components/providers/UserLocationProvider', () => ({ useUserLocation: () => ({ location: null, loading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/lib/queries/referentiel-public', () => ({ useEquipementsApprouves: () => ({ data: { data: [] } }) }));
vi.mock('@/hooks/useWizardDraft', () => ({ useWizardDraft: vi.fn() }));

import { PublierSansCompte } from '../PublierSansCompte';

const C = frMessages.coqueDEntree;
const B = frMessages.publishRedirect.sansCompte.brouillon;
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
const fetchOriginal = globalThis.fetch;
beforeEach(() => {
  clics = [];
  window.addEventListener('click', enregistrer);
  globalThis.fetch = vi.fn(async () => new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
});
afterEach(() => {
  window.removeEventListener('click', enregistrer);
  globalThis.fetch = fetchOriginal;
});

function monter(moteur: MoteurDeStockage | null) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <CoqueDEntree libelles={LIBELLES} titre="Publier votre bien" sortie={{ href: '/', forme: 'quitter' }}>
          <PublierSansCompte brouillonLocal={() => ouvrirBrouillonLocal({ moteur })} />
        </CoqueDEntree>
      </QueryClientProvider>,
    ),
  );
}

/** La barre du téléphone : la première des deux (`lg:hidden`), celle du bureau vient après. */
const barreDuTelephone = () => screen.getAllByRole('banner')[0]!;
const page = () => document.querySelector('[data-publier-sans-compte]') as HTMLElement;
const suivant = () => screen.getByRole('button', { name: /^continuer$/i });

async function premiereEtape(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: /^studio$/i }));
  await user.click(screen.getByRole('radio', { name: /^louer$/i }));
  await user.click(suivant());
  await screen.findByRole('heading', { level: 1, name: /où se trouve/i });
}

describe('TCK-2988 — la barre du téléphone de /publish', () => {
  it('au départ : ni pastilles, ni résumé, ni « Aperçu »', async () => {
    monter(moteurEnMemoire());
    await screen.findByRole('heading', { level: 1, name: 'Publiez votre bien gratuitement' });
    const barre = barreDuTelephone();
    expect(within(barre).queryByRole('img')).toBeNull();
    expect(barre.querySelector('[data-sous-titre-d-entree]')).toBeNull();
    expect(screen.queryByTestId('barre-apercu')).toBeNull();
  });

  it('dès la deuxième étape : le résumé sous l’intention, et « Aperçu » dans la barre — plus de barre d’aperçu dessous', async () => {
    const user = userEvent.setup();
    monter(moteurEnMemoire());
    await premiereEtape(user);
    const barre = barreDuTelephone();
    expect(barre.querySelector('[data-sous-titre-d-entree]')).toHaveTextContent('Studio · En location · Prix à venir');
    // Un seul « Aperçu » dans la page, et c'est celui de la barre.
    const apercus = screen.getAllByTestId('barre-apercu');
    expect(apercus).toHaveLength(1);
    expect(barre).toContainElement(apercus[0]!);
    expect(within(barre).queryByRole('img')).toBeNull();

    // Il ouvre le tiroir de l'aperçu, avec « Pour publier ».
    await user.click(apercus[0]!);
    const tiroir = await screen.findByRole('dialog');
    expect(within(tiroir).getByRole('navigation', { name: 'Étapes de la publication' })).toBeInTheDocument();
  });
});

describe('TCK-2988 — le brouillon au téléphone', () => {
  it('la ligne d’état ne paraît plus au téléphone (`hidden lg:flex`)', async () => {
    monter(moteurEnMemoire());
    await screen.findByRole('heading', { level: 1, name: 'Publiez votre bien gratuitement' });
    // La note de la barre du bureau dit la même chose (dès `xl`) : on lit celle de la page.
    expect(within(page()).getByText(B.navigateur).closest('div')).toHaveClass('hidden', 'lg:flex');
  });

  it('le navigateur ne garde rien : l’avertissement, lui, reste visible au téléphone', async () => {
    monter(null);
    // Deux fois dans la page : la ligne, et sa région `status` lue par les lecteurs d'écran (`sr-only`).
    const lignes = (await within(page()).findAllByText(B.refus)).map((e) => e.closest('div')!).filter((d) => d.classList.contains('min-h-11'));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toHaveClass('flex');
    expect(lignes[0]).not.toHaveClass('hidden');
  });

  it('un brouillon repris : une ligne au téléphone, avec « Effacer », qui vide le brouillon', async () => {
    const user = userEvent.setup();
    const moteur = moteurEnMemoire();
    const premier = monter(moteur);
    await premiereEtape(user);
    await waitFor(async () => expect(await moteur.lire('valeurs')).toBeDefined());
    premier.unmount();

    monter(moteur);
    const ligne = await screen.findByText(B.repris);
    const note = ligne.closest('[data-brouillon-repris]')!;
    expect(note.parentElement).toHaveClass('lg:hidden');
    // « Nous avons repris… » : au bureau seulement, pour ne pas le dire deux fois.
    expect(screen.getByText(frMessages.property.wizard.draftResumed)).toHaveClass('hidden', 'lg:block');

    await user.click(within(note as HTMLElement).getByRole('button', { name: B.effacerCourt }));
    await waitFor(async () => expect(await moteur.lire('valeurs')).toBeUndefined());
  });

  it('avec un brouillon, ✕ demande ; « Effacer le brouillon » le vide, puis part', async () => {
    const user = userEvent.setup();
    const moteur = moteurEnMemoire();
    monter(moteur);
    await premiereEtape(user);
    await waitFor(async () => expect(await moteur.lire('valeurs')).toBeDefined());

    await user.click(within(barreDuTelephone()).getByRole('link', { name: C.fermer }));
    const boite = await screen.findByRole('dialog');
    expect(within(boite).getByText(B.sortie)).toBeInTheDocument();
    await act(async () => {
      await user.click(within(boite).getByRole('button', { name: B.effacerEnSortant }));
    });
    expect(await moteur.lire('valeurs')).toBeUndefined();
    expect(clics.at(-1)).toEqual({ href: '/', annule: false });
  });
});
