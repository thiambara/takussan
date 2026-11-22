import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { InterventionsDuBailleur } from '../InterventionsDuBailleur';

/**
 * TCK-2919 (ADR-0120 § 3-4) — chez le bailleur : le bilan « Depuis janvier » (`GET
 * /api/owner/maintenance-summary`) et son détail par bien ; la mise en concurrence dans la carte du
 * devis (`quote_alternatives`). La couche RÉSEAU est doublée (`apiRequest`), pas les hooks.
 */
const reseau = vi.hoisted(() => ({
  appels: [] as string[],
  devis: [] as unknown[],
  enCours: [] as unknown[],
  fiche: null as Record<string, unknown> | null,
  bilan: null as Record<string, unknown> | null,
  bilanEnEchec: false,
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string, options: { method?: string } = {}) => {
      const lu = decodeURIComponent(path);
      reseau.appels.push(`${options.method ?? 'GET'} ${lu}`);
      if (lu.startsWith('/api/owner/maintenance-summary')) {
        if (reseau.bilanEnEchec) throw new Error('bilan illisible');
        return { data: reseau.bilan };
      }
      if (lu.startsWith('/api/maintenance-requests?')) {
        const data = lu.includes('filter[status]=awaiting_owner') ? reseau.devis : reseau.enCours;
        return { data, meta: { total: data.length, per_page: 10, current_page: 1, last_page: 1 } };
      }
      if (/^\/api\/maintenance-requests\/\d+(\?|$)/.test(lu)) return { data: reseau.fiche };
      throw new Error(`requête inattendue : ${lu}`);
    }),
  };
});

const HIER = new Date(Date.now() - 86_400_000).toISOString();
const LIGNE = {
  id: 42,
  property_id: 7,
  title: 'Étanchéité de la terrasse',
  category: 'structural',
  priority: 'normal',
  status: 'awaiting_owner',
  scheduled_at: null,
  created_at: HIER,
  waiting_since: HIER,
  quote_amount: 485000,
  quote_currency: 'XOF',
  quote_submitted_at: HIER,
  property: { id: 7, title: 'Villa Almadies', slug: null },
  assignee: { id: 12, name: 'Ibrahima Fall' },
};

const BILAN = {
  since: '2026-01-01',
  total: 12,
  closed: 9,
  charged_amount: 1521000,
  currency: 'XOF',
  by_property: [
    { property: { id: 7, title: 'Villa Almadies' }, total: 8, closed: 6, charged_amount: 1200000 },
    { property: { id: 9, title: 'Appartement Mermoz' }, total: 4, closed: 3, charged_amount: 321000 },
  ],
};

const espaces = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<InterventionsDuBailleur />}</QueryClientProvider>));
}

async function bloc() {
  return (await waitFor(() => {
    const b = document.querySelector('[data-slot="depuis-janvier"]');
    if (!b) throw new Error('bilan absent');
    return b;
  })) as HTMLElement;
}

describe('InterventionsDuBailleur — TCK-2919', () => {
  beforeEach(() => {
    reseau.appels = [];
    reseau.devis = [LIGNE];
    reseau.enCours = [];
    reseau.fiche = { ...LIGNE, owner_approval_threshold: 150000, abilities: { can_decide_quote: true }, property: { id: 7, title: 'Villa Almadies', slug: null, agency: { id: 1, name: 'Dakar Immo' } } };
    reseau.bilan = BILAN;
    reseau.bilanEnEchec = false;
  });

  it('AC1 — « Depuis janvier » : 12 interventions dont 9 closes, 1 521 000 F à votre charge, servis par l’API', async () => {
    monter();
    const b = await bloc();
    expect(within(b).getByRole('heading', { name: 'Depuis janvier' })).toBeTruthy();
    const chiffres = [...b.querySelectorAll('[data-slot="chiffre-du-bilan"]')].map((c) => espaces(c.textContent));
    expect(chiffres[0]).toBe('Interventions12dont 9 closes');
    expect(chiffres[1]).toMatch(/^À votre charge1 521 000 F/);
    expect(chiffres[1]).toContain('déduit de vos revenus');
    expect(reseau.appels).toContain('GET /api/owner/maintenance-summary');
  });

  it('AC1 — « Par bien » (téléphone) / « Historique par bien » (bureau) ouvre la liste des biens, chacun vers son historique', async () => {
    monter();
    const b = await bloc();
    const geste = within(b).getByRole('button', { name: /Par bien/ });
    expect(espaces(geste.textContent)).toBe('Par bienHistorique par bien');
    fireEvent.click(geste);
    const liste = (await waitFor(() => {
      const l = document.querySelector('[data-slot="bilan-des-biens"]');
      if (!l) throw new Error('détail absent');
      return l;
    })) as HTMLElement;
    const lignes = within(liste).getAllByRole('listitem');
    expect(lignes).toHaveLength(2);
    expect(espaces(lignes[0].textContent)).toMatch(/^Villa Almadies8 interventions · 6 closes1 200 000 F/);
    expect(within(lignes[1]).getByRole('link', { name: 'Appartement Mermoz' }).getAttribute('href')).toBe('/app/properties/9?tab=interventions');
  });

  it('sans devis ni intervention en cours, le bilan reste — pas d’état vide ; sans rien depuis janvier, l’état vide', async () => {
    reseau.devis = [];
    const { unmount } = monter();
    await bloc();
    expect(screen.queryByText('Aucune intervention sur vos biens')).toBeNull();
    unmount();

    reseau.bilan = { ...BILAN, total: 0, closed: 0, charged_amount: 0, by_property: [] };
    monter();
    expect(await screen.findByText('Aucune intervention sur vos biens')).toBeTruthy();
    expect(document.querySelector('[data-slot="depuis-janvier"]')).toBeNull();
  });

  it('un bilan illisible ne masque pas le devis : une ligne le dit', async () => {
    reseau.bilanEnEchec = true;
    monter();
    expect(await screen.findByText('Le bilan de vos interventions n’a pas pu être chargé.')).toBeTruthy();
    expect(document.querySelector('[data-slot="devis-a-decider"]')).not.toBeNull();
  });

  it('AC2 — deux devis concurrents de 520 000 F et 610 000 F : la phrase de mise en concurrence suit le seuil', async () => {
    reseau.fiche = {
      ...reseau.fiche,
      quote_alternatives: [
        { id: 1, provider_id: null, provider_name: 'Modou Kane', amount: 520000, currency: 'XOF', file: null, created_at: HIER },
        { id: 2, provider_id: 31, provider_name: 'Awa Ndiaye', amount: 610000, currency: 'XOF', file: null, created_at: HIER },
      ],
    };
    monter();
    const rappel = await waitFor(() => {
      const r = document.querySelector('[data-slot="rappel-du-plafond"]');
      if (!r?.textContent?.includes('consulté')) throw new Error('phrase absente');
      return r;
    });
    expect(espaces(rappel.textContent)).toBe(
      // « F CFA » : l'écriture d'un montant en XOF par `useFormatteurs` partout dans l'application.
      'Au-dessus de 150 000 F CFA, votre mandat prévoit votre accord. Dakar Immo a consulté deux autres artisans (520 000 F CFA et 610 000 F CFA) et recommande ce devis.',
    );
  });

  it('AC2 — sans devis concurrent, la phrase s’arrête au seuil du mandat', async () => {
    reseau.fiche = { ...reseau.fiche, quote_alternatives: [] };
    monter();
    const rappel = await screen.findByText(/^Au-dessus de .*votre mandat prévoit votre accord\.$/);
    expect(rappel.textContent).not.toContain('consulté');
  });
});
