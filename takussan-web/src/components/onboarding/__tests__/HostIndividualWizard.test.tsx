import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

/**
 * TCK-496 — l'assistant hôte compte TROIS étapes.
 *
 * L'étape « mode de paiement » demandait par quel opérateur être payé à
 * quelqu'un qui n'avait pas encore d'annonce, et la réponse n'était lue par
 * rien : le service back reporte lui-même la configuration réelle au premier
 * encaissement. *Ce qui est demandé doit servir à ce qu'on est en train de
 * faire.*
 *
 * ⚠ Le point qui n'est PAS évident et que ce fichier garde : un brouillon
 * enregistré sous l'ancien parcours porte un index d'étape qui n'existe plus.
 * Un assistant qui s'ouvrirait sur `steps[3]` d'un tableau qui en compte trois
 * rendrait un écran blanc, à quelqu'un qui reprend son inscription.
 */

const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
const hostIndividualOnboardAction = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

vi.mock('@/app/actions/onboarding', () => ({
  hostIndividualOnboardAction: (...args: unknown[]) => hostIndividualOnboardAction(...args),
}));

const refreshUser = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      first_name: 'Awa',
      last_name: 'Diop',
      phone: '+221770000000',
      phone_verified_at: new Date().toISOString(),
    },
    token: 'token',
    isLoading: false,
    setUser: vi.fn(),
    refreshUser,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: { city: 'Dakar', currency: 'XOF' }, loading: false }),
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, prefetch: vi.fn() }),
}));

/**
 * Le brouillon serveur est piloté par test : c'est LUI le sujet de l'AC4.
 * `{ ok: true, ecrit: false }` est ce que `flush()` rend au repos (TCK-475).
 */
let brouillon: { step: number; data: Record<string, unknown> } | null = null;
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: brouillon,
    isLoading: false,
    save: vi.fn(),
    flush: vi.fn().mockResolvedValue({ ok: true, ecrit: false }),
    clear: vi.fn().mockResolvedValue(undefined),
  }),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/toast')>();
  return { ...actual, useToast: () => ({ add: toastAdd }) };
});

import { HostIndividualWizard } from '../HostIndividualWizard';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

const RAIL = frMessages.onboarding.host.steps;

describe('<HostIndividualWizard> — trois étapes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brouillon = null;
    hostIndividualOnboardAction.mockResolvedValue({
      ok: true,
      data: { active_profile_id: 'agency_admin:5' },
    });
  });

  it('le rail affiche les trois étapes, et aucune ne parle de paiement', () => {
    // AC1 — le rail reflète la longueur du parcours : une étape retirée s'y voit.
    render(withIntl(<HostIndividualWizard />));

    // `getAllByText` : le titre de l'étape COURANTE apparaît deux fois — dans le
    // rail et en tête du corps d'étape (TCK-499). C'est voulu, pas un doublon.
    expect(screen.getAllByText(RAIL.intent.title).length).toBeGreaterThan(0);
    expect(screen.getByText(RAIL.identity.title)).toBeInTheDocument();
    expect(screen.getByText(RAIL.recap.title)).toBeInTheDocument();
    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Orange Money/i)).not.toBeInTheDocument();
  });

  it('un parcours complet sans nommer d’opérateur crée l’espace', async () => {
    // AC2 — et la charge utile ne porte PLUS `payment_setting` : l'assistant
    // n'invente pas une préférence par défaut pour combler le champ retiré.
    render(withIntl(<HostIndividualWizard />));

    fireEvent.click(screen.getByRole('button', { name: /Suivant/i })); // intent → identité
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i })); // identité → récap

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Terminer|Publier|Créer/i }));

    await waitFor(() => {
      expect(hostIndividualOnboardAction).toHaveBeenCalledTimes(1);
    });
    const envoye = hostIndividualOnboardAction.mock.calls[0][0];
    expect(envoye).not.toHaveProperty('payment_setting');
    expect(envoye.cgu_accepted).toBe(true);
  });

  it('le récapitulatif ne mentionne plus un fournisseur qui n’a pas été choisi', () => {
    render(withIntl(<HostIndividualWizard />));
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    expect(screen.getByText(RAIL.recap.rows.spaceName)).toBeInTheDocument();
    expect(screen.queryByText(/wave/i)).not.toBeInTheDocument();
  });

  it('un brouillon enregistré à l’ancienne étape 3 reprend sans casse', async () => {
    // AC4 — l'index 3 (le récapitulatif d'AVANT) n'existe plus. Le brouillon
    // doit atterrir sur une étape VALIDE, et les réponses déjà données doivent
    // survivre : c'est quelqu'un qui reprend son inscription, pas qui la
    // recommence.
    brouillon = {
      step: 3,
      data: {
        intent: 'individual',
        agency: { name: 'Espace de Awa Diop', primary_city: 'Thiès', currency: 'XOF' },
        phone_otp: { phone: '+221770000001', code: '', verified: true },
        preferences: { primary_property_type: 'house' },
        // La clé de l'ancien parcours est encore là, et elle est simplement ignorée.
        payment_setting: { preferred_provider: 'wave' },
        cgu_accepted: false,
      },
    };

    render(withIntl(<HostIndividualWizard />));

    // On atterrit sur la dernière étape existante — le récapitulatif —, pas sur
    // un écran vide.
    await waitFor(() => {
      expect(screen.getByText(RAIL.recap.rows.spaceName)).toBeInTheDocument();
    });
    // Et les réponses données avant le changement de parcours sont là.
    expect(screen.getByText('Thiès')).toBeInTheDocument();
    expect(screen.getByText('+221770000001')).toBeInTheDocument();
  });
});
