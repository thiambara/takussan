/**
 * TCK-2650 — AC1 à l'écran : la page de retour ne dit « confirmé » que sur un statut serveur payé.
 *
 *  · `payment_id=999999&status=success`, introuvable (404) : « lien invalide », et l'interrogation s'arrête ;
 *  · `pending` côté serveur avec `status=success` : « en cours de confirmation », et elle continue ;
 *  · une adresse illisible n'appelle pas l'API ;
 *  · ce que la carte nomme (montant, période, fournisseur) vient de `verify`, jamais de l'adresse.
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

import { PaymentReturnClient } from '../PaymentReturnClient';

type Reponse = { data: Record<string, unknown> } | undefined;
const etat = vi.hoisted(() => ({
  qs: '',
  data: undefined as Reponse,
  error: null as unknown,
  appels: [] as { type: string; id: number | null; options: { enabled?: boolean; refetchInterval?: unknown } }[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(etat.qs),
}));
vi.mock('@/hooks/useInitiatePayment', () => ({
  useVerifyPayment: (type: string, id: number | null, options: { enabled?: boolean; refetchInterval?: unknown }) => {
    etat.appels.push({ type, id, options });
    return { data: etat.data, error: etat.error, refetch: vi.fn() };
  },
}));
vi.mock('@/lib/queries/payments', () => ({ useResumeDuLoyer: () => ({ data: undefined }) }));

/** Le délai que la page demande à TanStack pour la prochaine interrogation, vu la réponse courante. */
function prochaineInterrogation(): unknown {
  const { refetchInterval } = etat.appels[etat.appels.length - 1].options;
  return typeof refetchInterval === 'function'
    ? refetchInterval({ state: { data: etat.data, error: etat.error } })
    : refetchInterval;
}

async function ouvrir(qs: string) {
  etat.qs = qs;
  render(withIntl(<PaymentReturnClient />));
  await act(async () => {
    vi.advanceTimersByTime(900);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  etat.data = undefined;
  etat.error = null;
  etat.appels = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TCK-2650 — le retour ne croit plus l’adresse (AC1)', () => {
  it('`payment_id=999999&status=success`, introuvable : « lien invalide », jamais « confirmé », et plus d’interrogation', async () => {
    etat.error = new ApiError(404, { message: 'Not found' });
    await ouvrir('payment_type=lease-payments&payment_id=999999&status=success');

    expect(screen.getByRole('heading', { name: 'Ce lien de retour ne correspond à aucun paiement' })).toBeInTheDocument();
    expect(screen.queryByText('Paiement confirmé')).toBeNull();
    expect(screen.getByRole('link', { name: 'Voir mes paiements' })).toHaveAttribute('href', '/app/payments');
    expect(prochaineInterrogation()).toBe(false);
  });

  it('`pending` côté serveur + `status=success` : « en cours de confirmation », et l’interrogation continue toutes les 15 s', async () => {
    etat.data = { data: { status: 'pending' } };
    await ouvrir('payment_type=lease-payments&payment_id=12&status=success');

    expect(screen.getByRole('heading', { name: 'Paiement en cours de confirmation' })).toBeInTheDocument();
    expect(screen.getByText('Vérification automatique toutes les 15 secondes')).toBeInTheDocument();
    expect(screen.queryByText('Paiement confirmé')).toBeNull();
    expect(prochaineInterrogation()).toBe(15_000);
  });

  it('après 2 minutes d’attente, l’interrogation s’arrête et « Vérifier à nouveau » la relance', async () => {
    etat.data = { data: { status: 'pending' } };
    await ouvrir('payment_type=lease-payments&payment_id=12&status=success');
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });

    expect(prochaineInterrogation()).toBe(false);
    expect(screen.getByRole('button', { name: 'Vérifier à nouveau' })).toBeInTheDocument();
    expect(screen.queryByText('Vérification automatique toutes les 15 secondes')).toBeNull();
  });

  it('`paid` côté serveur : « Paiement confirmé », la quittance du bail, et plus d’interrogation', async () => {
    etat.data = { data: { status: 'paid', payment: { amount: 1_355_000, currency: 'XOF', lease_id: 22, reference_number: 'LPY-M3ZQ8E', provider: 'wave', period_start: '2026-12-01', paid_at: '2026-11-10T09:42:00Z' } } };
    await ouvrir('payment_type=lease-payments&payment_id=12');

    expect(screen.getByRole('heading', { name: 'Paiement confirmé' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger la quittance' })).toBeInTheDocument();
    expect(screen.getByText('Payé le 10 nov. à 09:42')).toBeInTheDocument();
    expect(prochaineInterrogation()).toBe(false);
  });

  it('une erreur serveur n’est ni « invalide » ni « confirmé » : on attend', async () => {
    etat.error = new ApiError(503, {});
    await ouvrir('payment_type=lease-payments&payment_id=12&status=success');

    expect(screen.getByRole('heading', { name: 'Paiement en cours de confirmation' })).toBeInTheDocument();
    expect(prochaineInterrogation()).toBe(15_000);
  });

  it.each(['payment_type=admin%2Fusers&payment_id=12&status=success', 'payment_type=lease-payments&payment_id=..&status=success', 'status=success'])(
    'adresse illisible (%s) : aucun appel à l’API, « lien invalide »',
    async (qs) => {
      etat.data = { data: { status: 'paid' } };
      await ouvrir(qs);

      expect(etat.appels.every((a) => a.options.enabled === false)).toBe(true);
      expect(screen.getByRole('heading', { name: 'Ce lien de retour ne correspond à aucun paiement' })).toBeInTheDocument();
      expect(screen.queryByText('Paiement confirmé')).toBeNull();
    },
  );
});

describe('TCK-2650 — la carte nomme ce que le serveur a rendu', () => {
  it('le fournisseur, le montant et le mois viennent de `verify`', async () => {
    etat.data = { data: { status: 'pending', payment: { amount: 1_355_000, currency: 'XOF', provider: 'wave', period_start: '2026-12-01', reference_number: 'LPY-M3ZQ8E' } } };
    await ouvrir('payment_type=lease-payments&payment_id=12&status=success');

    expect(screen.getByText('Wave nous confirme votre paiement de 1 355 000 F. Vous recevrez un SMS dès que c’est fait. Vous pouvez fermer cette page.', { normalizer: (t) => t.replace(/\s/gu, ' ') })).toBeInTheDocument();
    expect(screen.getByText('Loyer de décembre 2026')).toBeInTheDocument();
    expect(screen.getByText('En attente de Wave')).toBeInTheDocument();
    expect(screen.getByText('LPY-M3ZQ8E')).toBeInTheDocument();
  });

  it('le grand montant est celui que le fournisseur débite (`checkout_amount`), la pénalité dite à part', async () => {
    etat.data = {
      data: { status: 'pending', payment: { amount: 150_000, checkout_amount: 157_500, checkout_late_fee_amount: 7_500, currency: 'XOF', provider: 'wave', period_start: '2026-12-01' } },
    };
    await ouvrir('payment_type=lease-payments&payment_id=12');
    const espaces = { normalizer: (t: string) => t.replace(/\s/gu, ' ') };
    expect(screen.getByText('Wave nous confirme votre paiement de 157 500 F. Vous recevrez un SMS dès que c’est fait. Vous pouvez fermer cette page.', espaces)).toBeInTheDocument();
    expect(screen.getByText('dont pénalité de retard')).toBeInTheDocument();
    expect(screen.getByText('7 500 F', espaces)).toBeInTheDocument();
  });

  it('décision 6a — la pénalité est celle que le serveur fige, jamais l’écart entre le checkout et la ligne', async () => {
    // Le checkout dépasse la ligne (une autre part, ex. des charges), mais sa part de pénalité est 0.
    etat.data = {
      data: { status: 'pending', payment: { amount: 150_000, checkout_amount: 157_500, checkout_late_fee_amount: 0, currency: 'XOF', provider: 'wave', period_start: '2026-12-01' } },
    };
    await ouvrir('payment_type=lease-payments&payment_id=12');
    expect(screen.getByText('Wave nous confirme votre paiement de 157 500 F. Vous recevrez un SMS dès que c’est fait. Vous pouvez fermer cette page.', { normalizer: (t) => t.replace(/\s/gu, ' ') })).toBeInTheDocument();
    expect(screen.queryByText('dont pénalité de retard')).toBeNull();
  });

  it('décision 6a — une part de pénalité absente (API d’avant) n’est pas reconstituée', async () => {
    etat.data = { data: { status: 'pending', payment: { amount: 150_000, checkout_amount: 157_500, currency: 'XOF', provider: 'wave', period_start: '2026-12-01' } } };
    await ouvrir('payment_type=lease-payments&payment_id=12');
    expect(screen.queryByText('dont pénalité de retard')).toBeNull();
  });

  it('sans `checkout_amount`, le montant de la ligne, et aucune pénalité déduite', async () => {
    etat.data = {
      data: { status: 'pending', payment: { amount: 150_000, checkout_amount: null, checkout_late_fee_amount: null, currency: 'XOF', provider: 'wave', period_start: '2026-12-01' } },
    };
    await ouvrir('payment_type=lease-payments&payment_id=12');
    expect(screen.getByText('Wave nous confirme votre paiement de 150 000 F. Vous recevrez un SMS dès que c’est fait. Vous pouvez fermer cette page.', { normalizer: (t) => t.replace(/\s/gu, ' ') })).toBeInTheDocument();
    expect(screen.queryByText('dont pénalité de retard')).toBeNull();
  });

  it('« Loyer d’avril », pas « Loyer de avril »', async () => {
    etat.data = { data: { status: 'pending', payment: { amount: 1_000, currency: 'XOF', provider: 'wave', period_start: '2027-04-01' } } };
    await ouvrir('payment_type=lease-payments&payment_id=12');
    expect(screen.getByText('Loyer d’avril 2027')).toBeInTheDocument();
  });

  it('sans `payment`, la carte dit l’issue seule — rien n’est lu dans l’adresse', async () => {
    etat.data = { data: { status: 'pending' } };
    await ouvrir('payment_type=lease-payments&payment_id=12&status=success&amount=1&provider=wave');

    expect(screen.getByText('Nous attendons la confirmation de votre paiement. Vous recevrez un SMS dès que c’est fait. Vous pouvez fermer cette page.')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="detail-du-paiement"]')).toBeNull();
    expect(screen.queryByText(/Wave/)).toBeNull();
  });
});
