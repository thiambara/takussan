import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import { MaintenanceBanner } from '../MaintenanceBanner';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

function statut(overrides: { active?: boolean; ends_at?: string } = {}) {
  return {
    data: {
      active: overrides.active ?? false,
      show_banner: true,
      generated_at: '2026-05-07T10:00:00.000Z',
      window: {
        id: 1,
        starts_at: '2026-05-07T10:20:00.000Z',
        ends_at: overrides.ends_at ?? '2026-05-07T11:00:00.000Z',
        mode: 'banner',
        severity: 'scheduled',
        messages: { fr: 'Maintenance planifiée', en: 'Planned maintenance', wo: 'Defar gi ci guddi gi' },
        banner_lead_minutes: 30,
      },
    },
  };
}

function renderBanner(payload: unknown, locale: LocaleDeTest = 'fr') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => payload,
  }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {withIntl(<MaintenanceBanner />, locale)}
    </QueryClientProvider>,
  );
}

describe('<MaintenanceBanner>', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the public maintenance message', async () => {
    renderBanner(statut());

    expect(await screen.findByText(/Maintenance planifiée/i)).toBeInTheDocument();
  });

  // TCK-572 — le message venait toujours de `messages.fr`, et les dates de `'fr-SN'` en dur.
  it('parle la langue du visiteur : message et fenêtre', async () => {
    renderBanner(statut(), 'en');

    expect(await screen.findByText(/Planned maintenance/)).toBeInTheDocument();
    expect(screen.queryByText(/Maintenance planifiée/)).not.toBeInTheDocument();
    expect(screen.getByText(/^From .+ to .+$/)).toBeInTheDocument();
  });

  // Reprise 2026-09-24 — le test ci-dessus ne lisait que « From … to … » : remettre
  // `toLocaleString('fr-SN')` à la place de `useFormatteurs` restait VERT (mesuré), la phrase
  // anglaise encadrant alors des dates `07/05/2026 10:20:00`. On lit la VALEUR : le format `en`
  // du dépôt (`en-GB`, fuseau de Dakar), jamais la forme numérique `fr-SN`.
  it('formate la fenêtre dans la langue du visiteur, pas en fr-SN', async () => {
    renderBanner(statut(), 'en');

    const fenetre = await screen.findByText(/^From .+ to .+$/);
    expect(fenetre).toHaveTextContent(/^From 7 May 2026, 10:20 to 7 May 2026, 11:00$/);
    expect(fenetre.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  // TCK-572 (vérification, mutation Vc) — le wolof n'était couvert par aucun test : retirer `wo` du
  // choix de langue servait le français aux visiteurs wolof, suite verte.
  it('sert le message wolof au visiteur wolof', async () => {
    renderBanner(statut(), 'wo');

    expect(await screen.findByText(/Defar gi ci guddi gi/)).toBeInTheDocument();
    expect(screen.queryByText(/Maintenance planifiée/)).not.toBeInTheDocument();
  });

  it('retombe sur le français quand la langue du visiteur n’a pas de message', async () => {
    const payload = statut();
    payload.data.window.messages = { fr: 'Maintenance planifiée', en: '', wo: '' };
    renderBanner(payload, 'en');

    expect(await screen.findByText(/Maintenance planifiée/)).toBeInTheDocument();
  });

  // TCK-572 — `sticky top-0 z-50` : collé, il passait sous la barre publique fixe et recouvrait la
  // barre haute de la console une fois défilé (mesuré). Il reste dans le flux de sa page.
  it('reste dans le flux : ni collé ni fixe', async () => {
    const { container } = renderBanner(statut());
    await screen.findByText(/Maintenance planifiée/);
    const bandeau = container.querySelector('[data-bandeau="maintenance"]')!;
    const classes = bandeau.className.split(/\s+/);
    expect(classes).not.toContain('sticky');
    expect(classes).not.toContain('fixed');
  });

  it('se ferme, et reste fermé pour la session tant que l’avis ne change pas', async () => {
    const premier = renderBanner(statut());
    fireEvent.click(await screen.findByRole('button', { name: "Masquer l'avis de maintenance" }));
    await waitFor(() => expect(screen.queryByText(/Maintenance planifiée/)).not.toBeInTheDocument());
    premier.unmount();

    // Rechargé (nouvelle instance), même avis : toujours masqué.
    const second = renderBanner(statut());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Maintenance planifiée/)).not.toBeInTheDocument();
    second.unmount();

    // La fenêtre annoncée passe « en cours » : c'est un autre avis, il revient.
    renderBanner(statut({ active: true }));
    expect(await screen.findByText(/Maintenance planifiée/)).toBeInTheDocument();
  });

  // TCK-572 (vérification, mutation Vb) — le code et le ticket promettent que l'avis revient quand
  // sa fin est repoussée ; aucun test ne le gardait : retirer `ends_at` de l'empreinte restait vert.
  it('revient quand la fin de la même fenêtre est repoussée', async () => {
    const premier = renderBanner(statut());
    fireEvent.click(await screen.findByRole('button', { name: "Masquer l'avis de maintenance" }));
    await waitFor(() => expect(screen.queryByText(/Maintenance planifiée/)).not.toBeInTheDocument());
    premier.unmount();

    // Même fenêtre, même état « annoncée », fin repoussée d'une heure : un autre avis.
    renderBanner(statut({ ends_at: '2026-05-07T12:00:00.000Z' }));
    expect(await screen.findByText(/Maintenance planifiée/)).toBeInTheDocument();
  });
});
