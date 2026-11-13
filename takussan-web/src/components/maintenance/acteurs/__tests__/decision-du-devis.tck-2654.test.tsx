import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { DecisionDuDevis } from '../DecisionDuDevis';

/**
 * TCK-2654 (L3b) — la décision du devis, montée telle quelle par la liste du bailleur et par la
 * feuille de son accueil (TCK-2624). La couche RÉSEAU est doublée (`apiRequest`), pas les hooks.
 */
const reseau = vi.hoisted(() => ({
  appels: [] as { path: string; method: string }[],
  fiche: null as Record<string, unknown> | null,
  approbation: 'ok' as 'ok' | 403,
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string, options: { method?: string } = {}) => {
      const method = options.method ?? 'GET';
      const lu = decodeURIComponent(path);
      reseau.appels.push({ path: lu, method });
      if (method === 'POST' && lu.endsWith('/quote/approve') && reseau.approbation === 403) {
        throw new reel.ApiError(403, { message: 'Interdit' });
      }
      if (method !== 'GET') return { data: reseau.fiche };
      if (/^\/api\/maintenance-requests\/\d+(\?|$)/.test(lu)) return { data: reseau.fiche };
      throw new Error(`requête inattendue : ${method} ${lu}`);
    }),
  };
});

const LIGNE = {
  id: 42,
  title: 'Étanchéité de la terrasse',
  status: 'awaiting_owner',
  quote_amount: 485000,
  quote_currency: 'XOF',
  assignee: { id: 12, name: 'Ibrahima Fall' },
} as unknown as InterventionEnFile;

const fiche = (surcharge: Record<string, unknown> = {}) => ({
  ...LIGNE,
  quote_lines: [{ label: 'Membrane bitumineuse bicouche', kind: 'supply', quantity: '1', unit_price: '310000', total: '310000' }],
  owner_approval_threshold: 150000,
  abilities: { can_decide_quote: true },
  ...surcharge,
});

function monter(props: Partial<Parameters<typeof DecisionDuDevis>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<DecisionDuDevis ligne={LIGNE} {...props} />}</QueryClientProvider>));
}

describe('DecisionDuDevis — TCK-2654 (L3b)', () => {
  beforeEach(() => {
    reseau.appels = [];
    reseau.fiche = fiche();
    reseau.approbation = 'ok';
  });

  it('le prestataire, les lignes, le total `quote_amount`, le rappel du plafond, et ce qui suit un refus', async () => {
    monter();
    expect(await screen.findByText(/^Au-dessus de .*150.000.*votre mandat prévoit votre accord\.$/)).toBeTruthy();
    expect(screen.getByText('Devis de Ibrahima Fall')).toBeTruthy();
    expect(screen.getByText('Membrane bitumineuse bicouche')).toBeTruthy();
    expect(document.querySelector('[data-slot="total-du-devis"]')?.textContent?.replace(/\D/g, '')).toBe('485000');
    expect(screen.getByText('Un refus demande un motif ; un nouveau devis pourra vous être soumis.')).toBeTruthy();
  });

  it('« Approuver » envoie POST …/quote/approve, puis appelle `onApprouve`', async () => {
    const onApprouve = vi.fn();
    monter({ onApprouve });
    fireEvent.click(await screen.findByRole('button', { name: /^Approuver .*485.000/ }));
    await waitFor(() => expect(onApprouve).toHaveBeenCalledTimes(1));
    expect(reseau.appels).toContainEqual({ path: '/api/maintenance-requests/42/quote/approve', method: 'POST' });
  });

  it('un 403 au geste appelle `onRefuse` (l’écran qui la monte retire le geste), pas `onApprouve`', async () => {
    reseau.approbation = 403;
    const onApprouve = vi.fn();
    const onRefuse = vi.fn();
    monter({ onApprouve, onRefuse });
    fireEvent.click(await screen.findByRole('button', { name: /^Approuver/ }));
    await waitFor(() => expect(onRefuse).toHaveBeenCalledTimes(1));
    expect(onApprouve).not.toHaveBeenCalled();
  });

  it('« Refuser » : le motif envoyé (POST …/quote/reject) appelle `onRejete` ; fermer sans envoyer ne l’appelle pas', async () => {
    const onRejete = vi.fn();
    monter({ onRejete });
    fireEvent.click(await screen.findByRole('button', { name: 'Refuser' }));
    const boite = await screen.findByRole('dialog');
    fireEvent.change(boite.querySelector('textarea') as HTMLTextAreaElement, { target: { value: 'Trop cher pour la saison des pluies' } });
    fireEvent.submit(boite.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(onRejete).toHaveBeenCalledTimes(1));
    expect(reseau.appels.some((a) => a.method === 'POST' && a.path === '/api/maintenance-requests/42/quote/reject')).toBe(true);
  });

  it('sans `can_decide_quote` : ni « Approuver » ni « Refuser » ; sans plafond servi : aucun rappel', async () => {
    reseau.fiche = fiche({ abilities: { can_decide_quote: false }, owner_approval_threshold: undefined });
    monter();
    await screen.findByText('Membrane bitumineuse bicouche');
    expect(screen.queryByRole('button', { name: /^Approuver/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull();
    expect(document.querySelector('[data-slot="rappel-du-plafond"]')).toBeNull();
  });

  it('L3b (2) — le PDF du devis sous `can_view_quote_pdf` : le lien télécharge …/quote/pdf ; sans le drapeau, rien', async () => {
    const telecharge = vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 }));
    vi.stubGlobal('fetch', telecharge);
    URL.createObjectURL = vi.fn(() => 'blob:devis');
    URL.revokeObjectURL = vi.fn();
    reseau.fiche = fiche({ abilities: { can_decide_quote: true, can_view_quote_pdf: true } });
    const { unmount } = monter();
    const lien = await screen.findByRole('button', { name: 'Télécharger le devis (PDF)' });
    expect(lien.closest('[data-slot="pdf-du-devis"]')).toBeTruthy();
    fireEvent.click(lien);
    await waitFor(() => expect(telecharge).toHaveBeenCalledTimes(1));
    expect(String((telecharge.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/maintenance-requests\/42\/quote\/pdf$/);
    unmount();
    vi.unstubAllGlobals();

    reseau.fiche = fiche({ abilities: { can_decide_quote: true, can_view_quote_pdf: false } });
    monter();
    await screen.findByText('Membrane bitumineuse bicouche');
    expect(screen.queryByRole('button', { name: 'Télécharger le devis (PDF)' })).toBeNull();
  });
});
