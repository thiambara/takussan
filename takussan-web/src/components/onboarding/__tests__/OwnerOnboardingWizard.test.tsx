import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

// Mock all server actions before importing the component.
const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
const ownerSubmitKycAction = vi.fn();
const ownerOnboardCompleteAction = vi.fn();
const getOwnerPropertiesAction = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

vi.mock('@/app/actions/owner-onboarding', () => ({
  ownerSubmitKycAction: (...args: unknown[]) => ownerSubmitKycAction(...args),
  ownerOnboardCompleteAction: (...args: unknown[]) => ownerOnboardCompleteAction(...args),
  getOwnerPropertiesAction: (...args: unknown[]) => getOwnerPropertiesAction(...args),
}));

const refreshUser = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { phone: '+221770000000', phone_verified_at: new Date().toISOString() },
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
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: null,
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

import { OwnerOnboardingWizard } from '../OwnerOnboardingWizard';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('<OwnerOnboardingWizard>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownerSubmitKycAction.mockResolvedValue({
      ok: true,
      data: {
        id: 7,
        kyc: { status: 'pending_review', submitted_at: null, docs: [] },
      },
    });
    ownerOnboardCompleteAction.mockResolvedValue({
      ok: true,
      data: {
        owner_profile: { id: 7, status: 'active' },
        active_profile_id: 'owner:7',
        properties_count: 2,
      },
    });
    getOwnerPropertiesAction.mockResolvedValue({
      ok: true,
      data: {
        data: [
          { id: 11, title: 'Villa des Almadies', city: 'Dakar' },
          { id: 12, title: 'Appartement Plateau', city: 'Dakar' },
        ],
        meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
      },
    });
  });

  it('navigates through all four steps and calls the owner onboarding actions on completion', async () => {
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} />));

    // Step 1 (phone) — user already verified via the mocked AuthContext,
    // canAdvance returns true. Move forward.
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 2 (KYC) — KYC has no canAdvance gate (non-blocking per spec),
    // so we can move on without uploading anything.
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 3 (tour) — both the tour's internal "Suivant" button and the
    // wizard footer "Suivant" share the same label. Disambiguate by
    // picking the last match (footer is rendered after the slide body).
    const suivantOnTour = screen.getAllByRole('button', { name: /Suivant/i });
    fireEvent.click(suivantOnTour[suivantOnTour.length - 1]);

    // Step 4 (recap) — ensures the recap fetch resolved with the
    // pre-attached properties before the final CTA fires.
    await waitFor(() => {
      expect(getOwnerPropertiesAction).toHaveBeenCalledWith(7);
    });

    fireEvent.click(screen.getByRole('button', { name: /Terminer/i }));

    await waitFor(() => {
      expect(ownerOnboardCompleteAction).toHaveBeenCalledWith(7, undefined);
    });

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/app');
    });
  });
});
