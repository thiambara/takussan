/**
 * TCK-364 — les cinq sondes et leur statut passent par une clé (AC2).
 *
 * ⚠️ Trois des cinq libellés retirés (`Cache`, `Mail`, `SMS`) sont IDENTIQUES en français et en
 * anglais : les asserter sur une seule locale ne dirait rien. Les cas ci-dessous comparent donc
 * `fr` et `en` sur les deux sondes qui bougent (`db`, `storage`) et sur le statut, puis vérifient
 * qu'aucun jeton d'API ne fuit à l'écran.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { PlatformHealth } from '@/types/super-admin';
import { HealthDashboard } from '../system-health';

const SANTE: PlatformHealth = {
  db: { status: 'ok', latency_ms: 3 },
  // ⚠️ `value: 'miss'` plutôt que `'ok'` — c'est une charge que le backend émet réellement
  //    (`Cache::get(…) === 'ok' ? 'ok' : 'miss'`), et elle est ici DÉLIBÉRÉE : le champ `value` est
  //    un jeton d'API affiché en indice, hors périmètre de la traduction. Le laisser à `'ok'`
  //    rendrait `'ok'` à l'écran pour une raison légitime, et l'assertion « aucun jeton de STATUT
  //    n'est affiché » ne pourrait plus distinguer les deux.
  cache: { status: 'ok', value: 'miss' },
  storage: { status: 'failed', error: 'disk full' },
  mail: { status: 'ok', driver: 'log' },
  sms: { status: 'ok', driver: 'log' },
  queue: { pending: 2, processing: 1, failed_24h: 0 },
  scheduler: { last_run_at: '2026-03-14T09:05:00Z' },
  generated_at: '2026-03-14T09:05:00Z',
};

vi.mock('@/lib/queries/super-admin', () => ({
  fetchPlatformHealth: vi.fn(async () => ({ data: SANTE })),
  fetchFailedJobs: vi.fn(async () => ({ data: [] })),
  retryFailedJob: vi.fn(),
  retryAllFailedJobs: vi.fn(),
  deleteFailedJob: vi.fn(),
}));

function monter(locale: LocaleDeTest) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <HealthDashboard />
    </QueryClientProvider>,
    locale,
  ));
}

describe('HealthDashboard — libellés de sondes', () => {
  it('rend « Base de données » en fr et « Database » en en', async () => {
    const fr = monter('fr');
    await waitFor(() => expect(screen.getByText('Base de données')).toBeInTheDocument());
    expect(screen.getByText('Stockage')).toBeInTheDocument();
    fr.unmount();

    const en = monter('en');
    await waitFor(() => expect(screen.getByText('Database')).toBeInTheDocument());
    expect(screen.getByText('Storage')).toBeInTheDocument();
    en.unmount();
  });

  it('n’affiche PLUS le jeton d’API du statut, dans aucune des trois locales', async () => {
    // ⚠️ L'ordre compte, et l'ablation l'a prouvé : asserter l'absence en premier passe AVANT que
    //    la requête ne résolve — le tableau est alors vide de tout, jetons compris. On attend donc
    //    qu'une sonde soit RENDUE, puis on vérifie qu'aucun jeton n'est monté avec elle.
    for (const locale of ['fr', 'en', 'wo'] as const) {
      const vue = monter(locale);
      await waitFor(() => expect(screen.getAllByText(/OK|Baax na/)).not.toHaveLength(0));
      // `ok` et `failed` sont les jetons émis par `HealthcheckService` — jamais des libellés.
      expect(screen.queryAllByText('ok')).toHaveLength(0);
      expect(screen.queryAllByText('failed')).toHaveLength(0);
      vue.unmount();
    }
  });

  it('traduit le statut : « En panne » en fr, « Down » en en', async () => {
    const fr = monter('fr');
    await waitFor(() => expect(screen.getByText('En panne')).toBeInTheDocument());
    fr.unmount();

    const en = monter('en');
    await waitFor(() => expect(screen.getByText('Down')).toBeInTheDocument());
    en.unmount();
  });
});
