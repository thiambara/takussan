/**
 * TCK-2629 (AC-F3) — l'onglet « Alertes » passe à la liste la valeur actuelle de chaque métrique, lue du résumé
 * de l'agence ; une lecture du résumé en échec ou refusée (hôte, super-admin sans agence) laisse l'onglet entier.
 */
import { describe, expect, it, vi } from 'vitest';

// Une fonction simple, pas `vi.fn` : la promesse rejetée d'un `vi.fn` est signalée par vitest même attrapée.
let resume: () => Promise<unknown> = async () => null;
vi.mock('@/lib/queries/alerts', () => ({ fetchThresholdAlerts: async () => ({ data: [] }) }));
vi.mock('@/lib/queries/dashboard-agency', () => ({ fetchDashboardAgency: () => resume() }));
vi.mock('@/lib/rapports/indicateurs', () => ({ apercusDuResume: () => ({ unpaid_rate_percent: 3.91 }) }));
vi.mock('@/components/rapports/alertes/AlertList', () => ({ AlertList: () => null }));

const { OngletAlertes } = await import('../OngletAlertes');

const apercus = async () => ((await OngletAlertes()) as { props: { apercus?: Record<string, number | null> } }).props.apercus;

describe('TCK-2629 — OngletAlertes', () => {
  it('passe les aperçus du résumé à la liste', async () => {
    resume = async () => ({ data: {} });
    expect(await apercus()).toEqual({ unpaid_rate_percent: 3.91 });
  });

  it('résumé refusé (null) : aucun aperçu, l’onglet reste', async () => {
    resume = async () => null;
    expect(await apercus()).toBeUndefined();
  });

  it('résumé en échec : aucun aperçu, l’onglet reste', async () => {
    resume = async () => {
      throw new Error('500');
    };
    expect(await apercus()).toBeUndefined();
  });
});
