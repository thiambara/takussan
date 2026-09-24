/**
 * TCK-572 — les bandeaux du site passaient SOUS la barre publique fixe.
 *
 * Mesuré le 2026-09-24 (Chrome headless, réponses de l'API substituées) : rendus par le layout
 * racine AVANT la page, ils étaient recouverts par la `nav` `fixed top-0` — à 320 px une annonce
 * de 127 px invisible, sa croix sous le bouton « Ouvrir le menu » (l'appui ouvrait le menu), et
 * l'accueil décalé de 127 px. jsdom ne fait aucune mise en page : ce qui est gardé ici est
 * l'ORDRE du document, qui est la cause — un bandeau placé avant la barre fixe est sous elle, un
 * bandeau placé après sa cale est sous la barre, visible.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import { BandeauxDuSite } from '../BandeauxDuSite';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fr',
  useRouter: () => ({ replace: vi.fn() }),
}));

const MAINTENANCE = {
  data: {
    active: false,
    show_banner: true,
    generated_at: '2026-09-24T10:00:00.000Z',
    window: {
      id: 7,
      starts_at: '2026-09-24T22:00:00.000Z',
      ends_at: '2026-09-24T23:00:00.000Z',
      mode: 'banner',
      severity: 'scheduled',
      messages: { fr: 'Maintenance ce soir' },
      banner_lead_minutes: 1440,
    },
  },
};

function monter(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<>{ui}</>)}</QueryClientProvider>);
}

/** Vrai si `a` précède `b` dans le document. */
function precede(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('<BandeauxDuSite> — un seul emplacement, jamais sous la barre fixe (TCK-572)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => MAINTENANCE }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('page publique : le bandeau est rendu UNE fois, après la barre et sa cale — pas avant la barre', async () => {
    // L'arbre réel : le layout racine monte son emplacement AVANT la page, la page monte la barre
    // fixe puis sa cale.
    const { container } = monter(
      <>
        <BandeauxDuSite emplacement="racine" />
        <nav data-testid="barre-fixe" />
        <NavbarSpacer />
        <main data-testid="contenu" />
      </>,
    );
    await screen.findByText(/Maintenance ce soir/);

    const bandeaux = container.querySelectorAll('[data-bandeau="maintenance"]');
    expect(bandeaux).toHaveLength(1);
    const bandeau = bandeaux[0]!;
    const cale = container.querySelector('[aria-hidden="true"].h-\\[69px\\]');
    expect(cale).not.toBeNull();
    expect(precede(screen.getByTestId('barre-fixe'), bandeau)).toBe(true);
    expect(precede(cale!, bandeau)).toBe(true);
    expect(precede(bandeau, screen.getByTestId('contenu'))).toBe(true);
    // L'emplacement racine s'est effacé.
    expect(container.querySelector('[data-emplacement="racine"]')).toBeNull();
  });

  it('page sans emplacement (connexion, onboarding) : le repli du layout racine affiche le bandeau', async () => {
    const { container } = monter(<BandeauxDuSite emplacement="racine" />);
    await screen.findByText(/Maintenance ce soir/);
    expect(container.querySelector('[data-emplacement="racine"] [data-bandeau="maintenance"]')).not.toBeNull();
  });

  it('la page qui portait les bandeaux s’en va : le repli racine reprend', async () => {
    function Arbre({ avecPage }: { readonly avecPage: boolean }) {
      return (
        <>
          <BandeauxDuSite emplacement="racine" />
          {avecPage ? <BandeauxDuSite emplacement="page" /> : null}
        </>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, rerender } = render(
      <QueryClientProvider client={client}>{withIntl(<Arbre avecPage />)}</QueryClientProvider>,
    );
    await screen.findByText(/Maintenance ce soir/);
    expect(container.querySelectorAll('[data-bandeau="maintenance"]')).toHaveLength(1);
    expect(container.querySelector('[data-emplacement="page"] [data-bandeau="maintenance"]')).not.toBeNull();

    rerender(<QueryClientProvider client={client}>{withIntl(<Arbre avecPage={false} />)}</QueryClientProvider>);
    await screen.findByText(/Maintenance ce soir/);
    expect(container.querySelectorAll('[data-bandeau="maintenance"]')).toHaveLength(1);
    expect(container.querySelector('[data-emplacement="racine"] [data-bandeau="maintenance"]')).not.toBeNull();
  });
});
