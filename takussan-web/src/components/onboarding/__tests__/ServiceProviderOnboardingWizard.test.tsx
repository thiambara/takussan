import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

// Mock all server actions before importing the component.
const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
const spPatchTradesAction = vi.fn();
const spPatchAvailabilityAction = vi.fn();
const spOnboardCompleteAction = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

vi.mock('@/app/actions/service-provider-onboarding', () => ({
  spPatchTradesAction: (...args: unknown[]) => spPatchTradesAction(...args),
  spPatchAvailabilityAction: (...args: unknown[]) => spPatchAvailabilityAction(...args),
  spOnboardCompleteAction: (...args: unknown[]) => spOnboardCompleteAction(...args),
}));

const refreshUser = vi.fn();
// TCK-566 — mutable : le cas « aucun numéro enregistré » en a besoin.
const UTILISATEUR_VERIFIE = {
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

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, prefetch: vi.fn() }),
}));

// `useWizardDraft` autosaves drafts via fetch — short-circuit it so the
// wizard hydrates with empty state and we can step through synchronously.
// TCK-566 — piloté par test : le brouillon RELU est le sujet du dernier cas.
let brouillon: { step: number; data: Record<string, unknown> } | null = null;
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: brouillon,
    isLoading: false,
    save: vi.fn(),
    // TCK-475 — cette doublure rendait `undefined`, et c'était FAUX depuis
    // TCK-465 : `flush()` rend un `ResultatEcritureBrouillon`, plus
    // `Promise<void>`. `undefined` ne simule pas le silence d'avant — c'est une
    // valeur qu'aucun appelant ne sait lire, et elle est restée verte tant que
    // personne ne lisait. Le jour où `WizardReprenable` s'est mis à consulter ce
    // résultat, les trois assistants d'onboarding sont tombés en TypeError.
    // `{ ok: true, ecrit: false }` est ce que la production rend au repos : rien
    // en attente, aucun échec antérieur (`useWizardDraft.ts`, `flush()`).
    flush: vi.fn().mockResolvedValue({ ok: true, ecrit: false }),
    clear: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Toast addition is invoked from inside the wizard — stub the provider
// so we can assert on calls without rendering the actual portal.
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/toast')>();
  return {
    ...actual,
    useToast: () => ({ add: toastAdd }),
  };
});

import { ServiceProviderOnboardingWizard } from '../ServiceProviderOnboardingWizard';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('<ServiceProviderOnboardingWizard>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spPatchTradesAction.mockResolvedValue({ ok: true, data: { id: 1 } });
    spPatchAvailabilityAction.mockResolvedValue({ ok: true, data: { id: 1 } });
    spOnboardCompleteAction.mockResolvedValue({
      ok: true,
      data: {
        sp_profile: { id: 42, status: 'active' },
        active_profile_id: 'service_provider:42',
        activated_collaborations: 1,
        redirect_to_maintenance_request_id: 99,
      },
    });
  });

  it('navigates through all steps and calls the SP onboarding actions on completion', async () => {
    render(withIntl(<ServiceProviderOnboardingWizard spProfileId={42} />));

    // Step 1 (phone) — user already verified via the mocked AuthContext,
    // canAdvance returns true. Move forward.
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 2 (trades) — pick a trade + add a zone.
    fireEvent.click(screen.getByTestId('trade-plumbing'));

    const zonesInput = screen.getByLabelText(/Zones d'intervention/i);
    fireEvent.change(zonesInput, { target: { value: 'Dakar' } });

    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 3 (availability) — toggle one slot to satisfy canAdvance.
    fireEvent.click(screen.getByTestId('availability-monday-morning'));
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 4 (recap) — final CTA.
    fireEvent.click(screen.getByRole('button', { name: /Terminer/i }));

    await waitFor(() => {
      expect(spPatchTradesAction).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          trades: ['plumbing'],
          intervention_zones: ['Dakar'],
        }),
      );
    });

    expect(spPatchAvailabilityAction).toHaveBeenCalledWith(
      42,
      expect.arrayContaining([
        expect.objectContaining({ day: 'monday', from: '08:00', to: '12:00' }),
      ]),
    );

    expect(spOnboardCompleteAction).toHaveBeenCalledWith(42, undefined);
    await waitFor(() => {
      // TCK-419 — cette assertion figeait un 404 : `/app/maintenance/requests/{id}` n'a jamais
      // eu de `page.tsx`. Le détail d'une demande vit sous `app/maintenance/[id]`.
      expect(routerPush).toHaveBeenCalledWith('/app/maintenance/99');
    });
  });
});

/**
 * TCK-566 — le numéro TAPÉ à cette étape n'était jamais envoyé : l'envoi du code
 * appelait `phoneSendOtpAction()` sans argument, donc visait le numéro déjà
 * enregistré — et, sans numéro enregistré, rendait « No phone number on file. »
 * à quelqu'un qui venait de le taper. Le champ était un `<Input>` libre,
 * indicatif à la charge de la personne.
 */
describe('<ServiceProviderOnboardingWizard> — saisie du téléphone (TCK-566)', () => {
  const PHONE = frMessages.serviceProviders.onboarding.steps.phone;

  beforeEach(() => {
    vi.clearAllMocks();
    utilisateur = { phone: null, phone_verified_at: null };
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true } });
  });

  afterEach(() => {
    utilisateur = UTILISATEUR_VERIFIE;
    brouillon = null;
  });

  it('envoie le code au numéro TAPÉ, indicatif en tête', async () => {
    const user = userEvent.setup();
    render(withIntl(<ServiceProviderOnboardingWizard spProfileId={42} />));

    const champ = await screen.findByLabelText(PHONE.fields.phone);
    await user.type(champ, '770000000', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    expect(champ).toHaveValue('770000000');

    await user.click(screen.getByRole('button', { name: PHONE.sendCta }));
    await waitFor(() => expect(phoneSendOtpAction).toHaveBeenCalledTimes(1));
    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221770000000');
  });

  // Relevé par le vérificateur : seul l'assistant hôte gardait ce critère. Une
  // régression vers `numero.trim() === ''` laissait partir « 7700000 » — sept
  // chiffres, que l'API refuse désormais en 422 — sans qu'aucun test rougisse.
  it('un numéro NON VIDE mais incomplet ne part pas : le bouton d’envoi reste inactif', async () => {
    const user = userEvent.setup();
    render(withIntl(<ServiceProviderOnboardingWizard spProfileId={42} />));

    const champ = await screen.findByLabelText(PHONE.fields.phone);
    await user.type(champ, '7700000');
    const envoyer = screen.getByRole('button', { name: PHONE.sendCta });
    expect(envoyer).toBeDisabled();

    await user.click(envoyer);
    expect(phoneSendOtpAction).not.toHaveBeenCalled();

    // Neuf chiffres après +221 : le numéro est composable, l'envoi s'ouvre.
    await user.type(champ, '00');
    expect(envoyer).toBeEnabled();
  });

  // Relevé par le vérificateur (déduit du code, reproduit ici) : seul
  // `initialData` passait par `recomposerTelephone`. Un numéro relu d'un
  // brouillon écrit par l'ancien champ libre — forme nationale, sans indicatif —
  // s'affichait bien dans l'ordre, mais « Envoyer le code » restait INACTIF sans
  // explication tant qu'on ne retouchait pas un chiffre.
  it('un numéro relu d’un brouillon hérité, sans indicatif, est remis en E.164 et part', async () => {
    brouillon = { step: 0, data: { phone: { number: '771234567', code: null, verified: false } } };
    const user = userEvent.setup();
    render(withIntl(<ServiceProviderOnboardingWizard spProfileId={42} />));

    const champ = await screen.findByLabelText(PHONE.fields.phone);
    expect(champ).toHaveValue('771234567');
    const envoyer = screen.getByRole('button', { name: PHONE.sendCta });
    expect(envoyer).toBeEnabled();

    await user.click(envoyer);
    await waitFor(() => expect(phoneSendOtpAction).toHaveBeenCalledTimes(1));
    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221771234567');
  });
});
