/**
 * TCK-572 — la croix des deux bandeaux se touche au doigt : 44 px au moins.
 *
 * Elle mesurait 32 px (40 sous `sm`, plancher du `Button`) — mesuré au navigateur à 1366 px :
 * 32 × 32. jsdom n'applique aucune feuille de style : on résout les classes à la main (taille
 * du bouton plus l'extension `after:-inset-*` qui agrandit la zone touchable sans rien déplacer).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import { MaintenanceBanner } from '@/components/maintenance/MaintenanceBanner';
import { GlobalAnnouncementBanner } from '../GlobalAnnouncementBanner';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fr',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, roles: ['owner'] }, token: 't', isLoading: false }),
}));

const REPONSES: Record<string, unknown> = {
  '/api/maintenance/status': {
    data: {
      active: false,
      show_banner: true,
      generated_at: '2026-09-24T10:00:00.000Z',
      window: {
        id: 3,
        starts_at: '2026-09-24T22:00:00.000Z',
        ends_at: '2026-09-24T23:00:00.000Z',
        mode: 'banner',
        severity: 'scheduled',
        messages: { fr: 'Maintenance ce soir' },
        banner_lead_minutes: 1440,
      },
    },
  },
  '/api/announcements/active': {
    data: [{
      id: 5,
      severity: 'warning',
      segment: {},
      starts_at: '2026-09-24T00:00:00Z',
      ends_at: null,
      is_active: true,
      created_by: null,
      created_at: null,
      updated_at: null,
      title: { fr: 'Nouvelle version', en: 'New release', wo: 'Yeesal bu bees' },
      body: { fr: 'Une nouveauté.', en: 'Something new.', wo: 'Am na lu bees.' },
    }],
  },
};

/**
 * Côté de la zone touchable en px, au-delà de `sm` (le cas le plus petit : sous `sm`, le plancher
 * du `Button` porte la boîte à 40 px) : `size-<n>`, MOINS deux fois la bordure, plus deux fois
 * `after:-inset-<m>` (échelle de 4 px).
 *
 * ⚠ La bordure compte : un `::after` en `position: absolute` se place depuis la boîte de PADDING
 * de son bouton, pas depuis sa boîte de bordure. Le `Button` porte `border` (1 px, transparente) :
 * `size-8` + `after:-inset-1.5` ne donne pas 32 + 12 = 44 mais 30 + 12 = 42 — mesuré au navigateur
 * à 1366 px (`elementFromPoint`, 2026-09-24), alors que la version précédente de ce calcul, qui
 * ignorait la bordure, rendait 44 et laissait passer l'écart.
 */
function coteTouchable(bouton: HTMLElement): number {
  let cote = 0;
  let bordure = 0;
  let extension = 0;
  for (const classe of bouton.className.split(/\s+/)) {
    if (classe.startsWith('size-')) cote = Number(classe.slice('size-'.length)) * 4;
    if (classe === 'border') bordure = 1;
    const epaisseur = /^border-(\d+)$/.exec(classe);
    if (epaisseur) bordure = Number(epaisseur[1]);
    if (classe.startsWith('after:-inset-')) extension = Number(classe.slice('after:-inset-'.length)) * 4;
  }
  return cote - 2 * bordure + 2 * extension;
}

describe('Croix des bandeaux — 44 px touchables (TCK-572)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => REPONSES[url] })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['annonce', <GlobalAnnouncementBanner key="a" />, "Masquer l'annonce"],
    ['maintenance', <MaintenanceBanner key="m" />, "Masquer l'avis de maintenance"],
  ] as const)('%s : la croix offre au moins 44 × 44 px', async (_nom, bandeau, nom) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>{withIntl(bandeau)}</QueryClientProvider>);

    const croix = await screen.findByRole('button', { name: nom });
    expect(croix.className.split(/\s+/)).toContain('relative');
    expect(coteTouchable(croix)).toBeGreaterThanOrEqual(44);
  });
});
