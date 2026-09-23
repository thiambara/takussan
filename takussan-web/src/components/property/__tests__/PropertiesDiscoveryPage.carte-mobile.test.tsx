import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';

/**
 * TCK-553 — M2 : sur téléphone, la carte (356 × 518, `touch-action: none`) était insérée dans une
 * page qui défile, sous ~400 px de contrôles et au-dessus du pied de page : sur 61 % de l'écran, le
 * doigt déplaçait la carte au lieu de la page. La vue carte occupe désormais l'écran sous la `nav`,
 * sans pied de page, et on en sort par la pastille flottante (TCK-552) — qui ramène la liste là où
 * on l'avait quittée.
 */

let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

const propsDeLaCarte: Array<Record<string, unknown>> = [];
vi.mock('@/components/map', () => ({
  PropertyMap: (props: Record<string, unknown>) => {
    propsDeLaCarte.push(props);
    return <div data-testid="carte" />;
  },
}));

/** La `nav` fixe du site public, dont le bas est mesuré à 71 px à 390 (notes du ticket). */
const BAS_DE_LA_NAV = 71;
vi.mock('@/components/home/Navbar', () => ({
  Navbar: () => (
    <nav
      data-testid="nav"
      style={{ position: 'fixed' }}
      ref={(el) => {
        if (el) el.getBoundingClientRect = () => ({ bottom: BAS_DE_LA_NAV, top: 0, height: BAS_DE_LA_NAV }) as DOMRect;
      }}
    />
  ),
}));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="pied" /> }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';

const matchMediaOriginal = window.matchMedia;
let mobile = true;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({
    data: [],
    facets: {},
    meta: { total: 12, per_page: 30, current_page: 1, last_page: 1 },
  });
  parametres = new URLSearchParams('contract_type=rent');
  propsDeLaCarte.length = 0;
  mobile = true;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width: 1023px') ? mobile : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = matchMediaOriginal;
  vi.restoreAllMocks();
});

const classes = (el: Element) => el.className.split(/\s+/);

/** La bascule de la rangée mobile (TCK-552). */
const basculeMobile = () =>
  screen.queryAllByRole('button', { name: /^carte$|^liste$/i }).find((b) => b.closest('[data-controle="bascule"]'));

async function monteEtPasseEnCarte() {
  render(withIntl(<PropertiesDiscoveryPage titre="Biens à louer" />));
  await screen.findByText(/^12 biens trouvés$/);
  await userEvent.click(basculeMobile()!);
  await waitFor(() => expect(screen.getByTestId('carte')).toBeInTheDocument());
}

describe('TCK-553 — la vue carte occupe l’écran sous lg (M2, AC3)', () => {
  it('la carte est calée sous la `nav` MESURÉE, jusqu’en bas de l’écran', async () => {
    await monteEtPasseEnCarte();
    const vue = document.querySelector('[data-vue-carte]') as HTMLElement;
    expect(vue).not.toBeNull();
    expect(classes(vue)).toEqual(
      expect.arrayContaining(['max-lg:fixed', 'max-lg:inset-x-0', 'max-lg:bottom-0']),
    );
    await waitFor(() => expect(vue.style.getPropertyValue('--haut-de-la-carte')).toBe(`${BAS_DE_LA_NAV}px`));
    expect(propsDeLaCarte.at(-1)).toMatchObject({ pleinEcranSousLg: true });
  });

  it('ni pied de page, ni titre, ni rangée d’outils sous lg : rien ne fait défiler la page derrière la carte', async () => {
    await monteEtPasseEnCarte();
    expect(classes(screen.getByTestId('pied').parentElement!)).toContain('max-lg:hidden');
    expect(classes(screen.getByRole('heading', { level: 1 }))).toContain('max-lg:hidden');
    expect(classes(document.querySelector('[data-rangee-outils]')!)).toContain('max-lg:hidden');
  });

  it('en vue liste, rien de tout cela n’est masqué', async () => {
    render(withIntl(<PropertiesDiscoveryPage titre="Biens à louer" />));
    await screen.findByText(/^12 biens trouvés$/);
    expect(classes(screen.getByTestId('pied').parentElement!)).not.toContain('max-lg:hidden');
    expect(classes(screen.getByRole('heading', { level: 1 }))).not.toContain('max-lg:hidden');
    expect(document.querySelector('[data-vue-carte]')).toBeNull();
  });
});

describe('TCK-553 — en vue carte, le compte est celui de la carte (M3, AC4)', () => {
  it('« 12 biens trouvés » — le compte de la LISTE — n’est plus affiché au-dessus de la carte', async () => {
    await monteEtPasseEnCarte();
    expect(screen.queryByText(/biens? trouvés?/)).toBeNull();
  });
});

describe('TCK-553 — le retour à la liste passe par la pastille flottante (AC5)', () => {
  it('en vue carte sous lg, la pastille Filtres / Liste est là sans avoir défilé', async () => {
    await monteEtPasseEnCarte();
    const pastille = screen.getByRole('group', { name: /outils de recherche/i });
    expect(within(pastille).getByRole('button', { name: /liste/i })).toBeInTheDocument();
    expect(within(pastille).getByRole('button', { name: /filtres/i })).toBeInTheDocument();
  });

  it('la pastille ramène la liste À LA POSITION de défilement quittée', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(withIntl(<PropertiesDiscoveryPage titre="Biens à louer" />));
    await screen.findByText(/^12 biens trouvés$/);

    // Le visiteur a défilé la liste avant de passer en carte.
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(1234);
    await userEvent.click(basculeMobile()!);
    await waitFor(() => expect(screen.getByTestId('carte')).toBeInTheDocument());

    scrollTo.mockClear();
    const pastille = screen.getByRole('group', { name: /outils de recherche/i });
    await userEvent.click(within(pastille).getByRole('button', { name: /liste/i }));

    await waitFor(() => expect(screen.queryByTestId('carte')).toBeNull());
    expect(scrollTo).toHaveBeenCalledWith(0, 1234);
  });

  it('à partir de lg, la pastille n’apparaît pas en vue carte : le bureau garde ses onglets', async () => {
    mobile = false;
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByText(/^12 biens trouvés$/);
    await userEvent.click(screen.getByRole('tab', { name: /carte/i }));
    await waitFor(() => expect(screen.getByTestId('carte')).toBeInTheDocument());
    expect(screen.queryByRole('group', { name: /outils de recherche/i })).toBeNull();
  });
});
