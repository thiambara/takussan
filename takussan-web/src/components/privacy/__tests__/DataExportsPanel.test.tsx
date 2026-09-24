import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataExportsPanel, intervalleDeSuivi } from '@/components/privacy/DataExportsPanel';
import { fetchMyDataExports } from '@/lib/queries/data-exports';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { DataExport, DataExportStatus } from '@/types/super-admin';

vi.mock('@/lib/queries/data-exports', () => ({
  fetchMyDataExports: vi.fn(),
  requestMyDataExport: vi.fn(),
}));

/**
 * TCK-567 (M16) — retour testeur du 2026-09-23 : après « Demander mon export », la ligne affichait
 * le statut BRUT de l'API, `queued`, en anglais, dans une interface en français.
 *
 * Le code de statut est stable côté API (`App\Models\Enums\DataExportStatus`, cinq cas) : c'est au
 * front de le traduire (principe n° 5 de CLAUDE.md). Ces tests lisent le TEXTE RENDU, pas un
 * attribut : un badge qui rend la clé ou le code se voit ici.
 */

const STATUTS: DataExportStatus[] = ['queued', 'processing', 'ready', 'expired', 'failed'];

function unExport(id: number, status: DataExportStatus): DataExport {
  return {
    id,
    user_id: 1,
    requested_by: 1,
    reason: null,
    status,
    size_bytes: null,
    requested_at: '2026-09-23T10:15:00Z',
    ready_at: status === 'ready' ? '2026-09-23T10:20:00Z' : null,
    expires_at: status === 'ready' ? '2026-09-30T10:20:00Z' : null,
    last_downloaded_at: null,
    download_url: null,
  };
}

function monter(exports: DataExport[], locale: LocaleDeTest = 'fr') {
  vi.mocked(fetchMyDataExports).mockResolvedValue({ data: exports });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <DataExportsPanel />
      </QueryClientProvider>,
      locale,
    ),
  );
}

describe('DataExportsPanel — statut de l’export (TCK-567, M16)', () => {
  beforeEach(() => {
    vi.mocked(fetchMyDataExports).mockReset();
  });

  it('traduit « queued » au lieu de rendre le code brut — la capture du testeur', async () => {
    monter([unExport(12, 'queued')]);

    const badge = await screen.findByTestId('data-export-status-12');
    expect(badge).toHaveTextContent('En attente');
    expect(screen.queryByText('queued')).toBeNull();
  });

  it.each(STATUTS)('aucun des cinq codes de l’API n’atteint l’écran tel quel (%s)', async (statut) => {
    monter([unExport(1, statut)]);

    const badge = await screen.findByTestId('data-export-status-1');
    expect(badge.textContent?.trim()).not.toBe(statut);
    expect(badge.textContent).not.toMatch(/privacy\.dataExports/);
  });

  it('suit la locale active — anglais et wolof ont leur libellé', async () => {
    const { unmount } = monter([unExport(3, 'processing')], 'en');
    expect(await screen.findByTestId('data-export-status-3')).toHaveTextContent('Preparing');
    unmount();

    monter([unExport(3, 'ready')], 'wo');
    expect(await screen.findByTestId('data-export-status-3')).toHaveTextContent('Pare na');
  });

  // Les CINQ statuts, pas trois : la préparation en cours (`info`) se distingue de l'attente, et
  // l'expiration (`neutral`) ne se lit ni comme un succès ni comme un échec. Un ton oublié ici
  // resterait vert quel que soit ce que le Record lui donne (vérification adverse, 2026-09-23).
  it.each<[DataExportStatus, string]>([
    ['queued', 'neutral'],
    ['processing', 'info'],
    ['ready', 'success'],
    ['expired', 'neutral'],
    ['failed', 'danger'],
  ])('porte un ton qui dit l’état : %s → %s', async (statut, ton) => {
    monter([unExport(5, statut)]);

    expect(await screen.findByTestId('data-export-status-5')).toHaveAttribute('data-tone', ton);
  });

  // Les DEUX statuts de préparation : l'e-mail est promis tant que l'archive se fabrique, pas
  // seulement tant qu'elle attend son tour. `status === 'queued'` laissait ce test vert
  // (vérification adverse du 2026-09-23).
  it.each<DataExportStatus>(['queued', 'processing'])(
    'explique l’attente tant que l’archive se prépare : %s',
    async (statut) => {
      monter([unExport(7, statut)]);
      const ligne = (await screen.findByTestId('data-export-status-7')).closest('[data-testid="data-export-row"]');
      expect(ligne).not.toBeNull();
      expect(within(ligne as HTMLElement).getByText(fr.privacy.dataExports.pendingHint)).toBeInTheDocument();
    },
  );

  it.each<DataExportStatus>(['ready', 'expired', 'failed'])(
    'ne promet plus d’e-mail une fois la préparation finie : %s',
    async (statut) => {
      monter([unExport(8, statut)]);
      await screen.findByTestId('data-export-status-8');
      expect(screen.queryByText(fr.privacy.dataExports.pendingHint)).toBeNull();
    },
  );

  // Le wolof sur les CINQ statuts, et contre la copie : une valeur française ou anglaise posée
  // dans `wo.json` passe `check-i18n` (la clé existe) et ne se voyait que sur « ready »
  // (vérification adverse du 2026-09-23, `status.queued = 'En attente'` dans wo.json).
  it.each(STATUTS)('en wolof, le statut %s a un libellé wolof — pas une copie du français ni de l’anglais', async (statut) => {
    const libelle = wo.privacy.dataExports.status[statut];
    expect(libelle).not.toBe(fr.privacy.dataExports.status[statut]);
    expect(libelle).not.toBe(en.privacy.dataExports.status[statut]);

    monter([unExport(6, statut)], 'wo');
    expect(await screen.findByTestId('data-export-status-6')).toHaveTextContent(libelle);
  });

  it('en wolof, l’annonce de l’e-mail est traduite', async () => {
    const annonce = wo.privacy.dataExports.pendingHint;
    expect(annonce).not.toBe(fr.privacy.dataExports.pendingHint);
    expect(annonce).not.toBe(en.privacy.dataExports.pendingHint);

    monter([unExport(10, 'processing')], 'wo');
    await screen.findByTestId('data-export-status-10');
    expect(screen.getByText(annonce)).toBeInTheDocument();
  });

  it('date la demande dans la locale active, pas en « fr-FR » figé', async () => {
    monter([unExport(4, 'queued')], 'en');
    const ligne = (await screen.findByTestId('data-export-status-4')).closest('[data-testid="data-export-row"]');
    // en-GB, fuseau Africa/Dakar : « 23 Sept 2026 » — jamais « 23/09/2026 » ni « septembre ».
    expect(ligne).toHaveTextContent(/Requested on 23 Sept? 2026/);
    expect(ligne).not.toHaveTextContent(/septembre|23\/09\/2026/);
  });
});

describe('intervalleDeSuivi — la liste se rafraîchit tant qu’un export est en cours', () => {
  it('rafraîchit tant qu’un export est en attente ou en préparation', () => {
    expect(intervalleDeSuivi([unExport(1, 'queued')])).toBeGreaterThan(0);
    expect(intervalleDeSuivi([unExport(1, 'ready'), unExport(2, 'processing')])).toBeGreaterThan(0);
  });

  it('s’arrête quand plus rien ne se prépare', () => {
    expect(intervalleDeSuivi([unExport(1, 'ready'), unExport(2, 'failed'), unExport(3, 'expired')])).toBe(false);
    expect(intervalleDeSuivi([])).toBe(false);
    expect(intervalleDeSuivi(undefined)).toBe(false);
  });

  it('le panneau l’applique : un export en attente passe à « Prêt » sans recharger la page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(fetchMyDataExports).mockReset();
      vi.mocked(fetchMyDataExports)
        .mockResolvedValueOnce({ data: [unExport(9, 'queued')] })
        .mockResolvedValue({ data: [unExport(9, 'ready')] });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        withIntl(
          <QueryClientProvider client={client}>
            <DataExportsPanel />
          </QueryClientProvider>,
        ),
      );

      expect(await screen.findByTestId('data-export-status-9')).toHaveTextContent('En attente');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await screen.findByText('Prêt')).toBeInTheDocument();
      expect(fetchMyDataExports).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
