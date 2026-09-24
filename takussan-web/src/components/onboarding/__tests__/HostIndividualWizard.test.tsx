import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const UTILISATEUR_VERIFIE = {
  first_name: 'Awa',
  last_name: 'Diop',
  phone: '+221770000000' as string | null,
  phone_verified_at: new Date().toISOString() as string | null,
};
let utilisateur = UTILISATEUR_VERIFIE;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: utilisateur,
    token: 'token',
    isLoading: false,
    setUser: vi.fn(),
    refreshUser,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

let localisation: { city: string; currency: string; country_calling_code?: string } = {
  city: 'Dakar',
  currency: 'XOF',
};
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: localisation, loading: false }),
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
// TCK-566 — espions stables : le brouillon fantôme hérité doit être SUPPRIMÉ
// (et non réécrit) à la réouverture.
const sauverBrouillon = vi.fn();
const effacerBrouillon = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: brouillon,
    isLoading: false,
    save: sauverBrouillon,
    flush: vi.fn().mockResolvedValue({ ok: true, ecrit: false }),
    clear: effacerBrouillon,
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
    utilisateur = UTILISATEUR_VERIFIE;
    localisation = { city: 'Dakar', currency: 'XOF' };
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
    // TCK-566 — le récapitulatif lit le numéro par groupes (`+221 77 000 00 01`) ;
    // la valeur enregistrée, elle, reste en E.164 compact.
    expect(screen.getByText('+221 77 000 00 01')).toBeInTheDocument();
  });
});

/**
 * TCK-566 — retour testeur du 2026-09-23 : « L'input du téléphone. »
 *
 * Le champ était amorcé avec la VALEUR `+221` (l'indicatif géo). Le testeur a
 * cliqué en tête du champ et tapé son numéro : `78|+221` à l'écran, puis
 * `780143710+221` au récapitulatif — et c'est cette chaîne-là qui partait au
 * serveur avec la demande de code.
 */
describe('<HostIndividualWizard> — saisie du téléphone (TCK-566)', () => {
  const CHAMPS = frMessages.onboarding.host.steps.identity;

  beforeEach(() => {
    vi.clearAllMocks();
    brouillon = null;
    utilisateur = { first_name: 'Fa', last_name: 'Diop', phone: null, phone_verified_at: null };
    localisation = { city: 'Dakar', currency: 'XOF', country_calling_code: '+221' };
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true } });
  });

  it('un curseur posé en tête du champ n’envoie pas « 780143710+221 » au serveur', async () => {
    const user = userEvent.setup();
    render(withIntl(<HostIndividualWizard />));
    await user.click(screen.getByRole('button', { name: /Suivant/i })); // intent → identité

    const champ = screen.getByLabelText(CHAMPS.fields.phone);
    // Le geste du testeur : curseur en position 0, puis la frappe.
    await user.type(champ, '780143710', { initialSelectionStart: 0, initialSelectionEnd: 0 });

    expect(champ).toHaveValue('780143710');
    await user.click(screen.getByRole('button', { name: CHAMPS.otp.sendCta }));

    await waitFor(() => expect(phoneSendOtpAction).toHaveBeenCalledTimes(1));
    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221780143710');
  });

  it('un numéro incomplet ne part pas : le bouton d’envoi reste inactif', async () => {
    const user = userEvent.setup();
    render(withIntl(<HostIndividualWizard />));
    await user.click(screen.getByRole('button', { name: /Suivant/i }));

    await user.type(screen.getByLabelText(CHAMPS.fields.phone), '78');
    expect(screen.getByRole('button', { name: CHAMPS.otp.sendCta })).toBeDisabled();
  });

  it('le récapitulatif remet dans l’ordre un numéro enregistré sous la forme corrompue', async () => {
    // Le compte du testeur porte déjà la chaîne fautive, vérifiée : elle est
    // relue telle quelle à l'ouverture de l'assistant.
    utilisateur = {
      first_name: 'Fa',
      last_name: 'Diop',
      phone: '780143710+221',
      phone_verified_at: new Date().toISOString(),
    };
    const user = userEvent.setup();
    render(withIntl(<HostIndividualWizard />));
    await user.click(screen.getByRole('button', { name: /Suivant/i }));
    await user.click(screen.getByRole('button', { name: /Suivant/i }));

    expect(screen.getByText('+221 78 014 37 10')).toBeInTheDocument();
    expect(screen.queryByText('780143710+221')).not.toBeInTheDocument();
  });

  // Relevé par le vérificateur : l'ANCIEN autosave écrivait l'état vierge dès
  // l'ouverture, téléphone amorcé à `+221` pour un compte sans numéro (et le
  // serveur rend `''` en `null`). Le nouvel état vierge porte `''` : réinjecté
  // brut, ce `+221` rendait le brouillon différent du vierge, donc jamais
  // supprimé — il restait jusqu'à la purge à 90 jours.
  it('le brouillon fantôme hérité (téléphone « +221 » seul) est supprimé à la réouverture', async () => {
    brouillon = {
      step: 0,
      data: {
        intent: 'individual',
        agency: { name: 'Espace de Fa Diop', primary_city: 'Dakar', currency: 'XOF' },
        phone_otp: { phone: '+221', code: null, verified: false },
        preferences: { primary_property_type: 'apartment' },
        cgu_accepted: false,
      },
    };
    render(withIntl(<HostIndividualWizard />));

    await waitFor(() => expect(effacerBrouillon).toHaveBeenCalledTimes(1));
    expect(sauverBrouillon).not.toHaveBeenCalled();
  });

  // Relevé par le vérificateur (passe 3, déduit du code, reproduit ici) :
  // l'ancien autosave amorçait le téléphone avec l'indicatif géo DE CE
  // JOUR-LÀ. Rouvert sous un autre indicatif (voyage, VPN, diaspora), le
  // fantôme `+221` passait pour un numéro international : il n'était pas
  // reconnu vierge, restait sur le tableau de bord, et le champ affichait
  // « +221 » comme une saisie.
  it('le fantôme « +221 » est supprimé même quand l’indicatif géo a changé', async () => {
    localisation = { city: 'Dakar', currency: 'XOF', country_calling_code: '+33' };
    brouillon = {
      step: 0,
      data: {
        intent: 'individual',
        agency: { name: 'Espace de Fa Diop', primary_city: 'Dakar', currency: 'XOF' },
        phone_otp: { phone: '+221', code: null, verified: false },
        preferences: { primary_property_type: 'apartment' },
        cgu_accepted: false,
      },
    };
    render(withIntl(<HostIndividualWizard />));

    await waitFor(() => expect(effacerBrouillon).toHaveBeenCalledTimes(1));
    expect(sauverBrouillon).not.toHaveBeenCalled();
  });

  it('un numéro relu d’un brouillon sous la forme corrompue est remis dans l’ordre et part', async () => {
    brouillon = {
      step: 1,
      data: {
        intent: 'individual',
        agency: { name: 'Espace de Fa Diop', primary_city: 'Dakar', currency: 'XOF' },
        phone_otp: { phone: '780143710+221', code: null, verified: false },
        preferences: { primary_property_type: 'apartment' },
        cgu_accepted: false,
      },
    };
    const user = userEvent.setup();
    render(withIntl(<HostIndividualWizard />));

    const champ = await screen.findByLabelText(CHAMPS.fields.phone);
    expect(champ).toHaveValue('780143710');
    const envoyer = screen.getByRole('button', { name: CHAMPS.otp.sendCta });
    expect(envoyer).toBeEnabled();

    await user.click(envoyer);
    await waitFor(() => expect(phoneSendOtpAction).toHaveBeenCalledTimes(1));
    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221780143710');
  });
});
