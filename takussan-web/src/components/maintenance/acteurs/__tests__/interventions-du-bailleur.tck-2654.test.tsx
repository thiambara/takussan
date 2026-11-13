import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { InterventionsDuBailleur } from '../InterventionsDuBailleur';

/**
 * TCK-2654, lot 3 — « Interventions » du bailleur. La couche RÉSEAU est doublée (`apiRequest`), pas
 * les hooks : AC6 se prouve sur la requête envoyée (`POST …/quote/approve`), pas sur un appel de
 * fonction.
 */
const reseau = vi.hoisted(() => ({
  appels: [] as { path: string; method: string }[],
  devis: [] as unknown[],
  enCours: [] as unknown[],
  fiche: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string, options: { method?: string } = {}) => {
      const method = options.method ?? 'GET';
      const lu = decodeURIComponent(path);
      reseau.appels.push({ path: lu, method });
      if (method !== 'GET') return { data: reseau.fiche };
      if (lu.startsWith('/api/maintenance-requests?')) {
        const data = lu.includes('filter[status]=awaiting_owner') ? reseau.devis : reseau.enCours;
        return { data, meta: { total: data.length, per_page: 10, current_page: 1, last_page: 1 } };
      }
      if (/^\/api\/maintenance-requests\/\d+(\?|$)/.test(lu)) return { data: reseau.fiche };
      throw new Error(`requête inattendue : ${method} ${lu}`);
    }),
  };
});

const HIER = new Date(Date.now() - 4 * 86_400_000).toISOString();

const LIGNE_DU_DEVIS = {
  id: 42,
  property_id: 7,
  requester_id: 78,
  assigned_to: 12,
  title: 'Étanchéité de la terrasse',
  category: 'structural',
  priority: 'normal',
  status: 'awaiting_owner',
  scheduled_at: null,
  completed_at: null,
  created_at: HIER,
  waiting_since: HIER,
  quote_amount: 485000,
  quote_currency: 'XOF',
  quote_submitted_at: HIER,
  quote_decision_at: null,
  estimated_cost: null,
  actual_cost: null,
  property: { id: 7, title: 'Villa Almadies', slug: null },
  requester: { id: 78, name: 'Fatou Kiné Diallo' },
  assignee: { id: 12, name: 'Ibrahima Fall' },
};

function fiche(surcharge: Record<string, unknown> = {}) {
  return {
    ...LIGNE_DU_DEVIS,
    quote_lines: [
      { label: 'Dépose de l’ancienne membrane', kind: 'labour', quantity: '1', unit_price: '95000', total: '95000' },
      { label: 'Membrane bitumineuse bicouche', kind: 'supply', quantity: '1', unit_price: '310000', total: '310000' },
    ],
    owner_approval_threshold: 150000,
    abilities: { can_decide_quote: true, can_view_quote_pdf: true },
    ...surcharge,
  };
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<InterventionsDuBailleur />}</QueryClientProvider>));
}

async function carte() {
  return (await waitFor(() => {
    const c = document.querySelector('[data-slot="devis-a-decider"]');
    if (!c) throw new Error('carte absente');
    return c;
  })) as HTMLElement;
}

describe('InterventionsDuBailleur — TCK-2654', () => {
  beforeEach(() => {
    reseau.appels = [];
    reseau.devis = [LIGNE_DU_DEVIS];
    reseau.enCours = [];
    reseau.fiche = fiche();
  });

  it('les devis à décider sont FILTRÉS par l’API, et « en cours » ne les reprend pas', async () => {
    monter();
    await carte();
    const listes = reseau.appels.filter((a) => a.method === 'GET' && a.path.startsWith('/api/maintenance-requests?'));
    expect(listes.some((a) => a.path.includes('filter[status]=awaiting_owner'))).toBe(true);
    const enCours = listes.find((a) => !a.path.includes('filter[status]=awaiting_owner'));
    expect(enCours?.path).toMatch(/filter\[status\]=[a-z_,]+/);
    expect(enCours?.path).not.toContain('awaiting_owner');
  });

  it('AC6 — plafond de 150 000 F, devis de 485 000 F : le seuil est rappelé, et « Approuver » envoie POST …/quote/approve', async () => {
    monter();
    const c = await carte();
    const rappel = await within(c).findByText(/^Au-dessus de .*150.000.*votre mandat prévoit votre accord\.$/);
    expect(rappel.getAttribute('data-slot')).toBe('rappel-du-plafond');
    expect(within(c).getByText(/Votre accord est attendu · depuis 4 jours/)).toBeTruthy();
    expect(within(c).getByText('Villa Almadies · signalée par Fatou Kiné Diallo')).toBeTruthy();
    expect(within(c).getByText('Devis de Ibrahima Fall')).toBeTruthy();

    fireEvent.click(within(c).getByRole('button', { name: /^Approuver .*485.000/ }));
    await waitFor(() =>
      expect(reseau.appels).toContainEqual({ path: '/api/maintenance-requests/42/quote/approve', method: 'POST' }),
    );
  });

  it('après « Approuver », les listes sont relues : la carte du devis décidé disparaît', async () => {
    monter();
    const c = await carte();
    const lecturesAvant = reseau.appels.filter((a) => a.method === 'GET' && a.path.includes('filter[status]=awaiting_owner')).length;
    // L'API a décidé : le devis quitte `awaiting_owner`, la liste relue ne le rend plus.
    reseau.devis = [];
    fireEvent.click(await within(c).findByRole('button', { name: /^Approuver/ }));
    await waitFor(() => expect(document.querySelector('[data-slot="devis-a-decider"]')).toBeNull());
    const lecturesApres = reseau.appels.filter((a) => a.method === 'GET' && a.path.includes('filter[status]=awaiting_owner')).length;
    expect(lecturesApres).toBeGreaterThan(lecturesAvant);
  });

  it('sans plafond servi (null), les gestes restent, sans rappel', async () => {
    reseau.fiche = fiche({ owner_approval_threshold: null });
    monter();
    const c = await carte();
    await within(c).findByRole('button', { name: /^Approuver/ });
    expect(c.querySelector('[data-slot="rappel-du-plafond"]')).toBeNull();
  });

  it('sans `can_decide_quote`, ni « Approuver » ni « Refuser »', async () => {
    reseau.fiche = fiche({ abilities: { can_decide_quote: false, can_view_quote_pdf: true } });
    monter();
    const c = await carte();
    await within(c).findByText('Total du devis');
    expect(within(c).queryByRole('button', { name: /^Approuver/ })).toBeNull();
    expect(within(c).queryByRole('button', { name: 'Refuser' })).toBeNull();
  });

  it('« Refuser » ouvre le motif du refus, chargé seulement à l’ouverture (TCK-1038)', async () => {
    monter();
    const c = await carte();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(await within(c).findByRole('button', { name: 'Refuser' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('le total est `quote_amount`, pas la somme des lignes', async () => {
    monter();
    const c = await carte();
    const total = await waitFor(() => {
      const el = c.querySelector('[data-slot="total-du-devis"]');
      if (!el?.textContent?.match(/\d/)) throw new Error('total absent');
      return el;
    });
    // Lignes : 95 000 + 310 000 = 405 000 ; le devis : 485 000.
    expect(total.textContent?.replace(/\D/g, '')).toBe('485000');
  });

  it('en cours : le bien et l’artisan, le montant, « Devis approuvé le … » ; la ligne mène à la fiche', async () => {
    reseau.devis = [];
    reseau.enCours = [
      {
        ...LIGNE_DU_DEVIS,
        id: 9,
        title: 'Peinture du séjour',
        status: 'approved',
        quote_amount: 180000,
        quote_decision_at: HIER,
        property: { id: 8, title: 'Appartement Mermoz', slug: null },
        assignee: { id: 13, name: 'Moussa Faye' },
      },
    ];
    monter();
    const ligne = (await waitFor(() => {
      const l = document.querySelector('[data-slot="bailleur-en-cours"]');
      if (!l) throw new Error('ligne absente');
      return l;
    })) as HTMLElement;
    expect(within(ligne).getByRole('link', { name: 'Peinture du séjour' }).getAttribute('href')).toBe('/app/maintenance/9');
    expect(within(ligne).getByText('Appartement Mermoz · Moussa Faye')).toBeTruthy();
    expect(ligne.textContent).toMatch(/180.000/);
    expect(within(ligne).getByText(/^Devis approuvé le /)).toBeTruthy();
    expect(document.querySelector('[data-slot="devis-a-decider"]')).toBeNull();
  });

  it('sans rien sur ses biens : un état vide', async () => {
    reseau.devis = [];
    reseau.enCours = [];
    monter();
    expect(await screen.findByText('Aucune intervention sur vos biens')).toBeTruthy();
  });
});
