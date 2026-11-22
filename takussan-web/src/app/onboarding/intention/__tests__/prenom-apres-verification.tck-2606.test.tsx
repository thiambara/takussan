/**
 * TCK-2606 — AC1 amendé (décision a) : un compte créé par la voie e-mail n'a pas de prénom ; après
 * « Vérifiez votre adresse », « Continuer » mène à `/onboarding/intention`
 * (`oubli-et-verification.tck-2606.test.tsx`), et c'est CETTE page qui le demande. Le dernier
 * maillon de la chaîne : la page, rendue pour un compte sans prénom, pose l'étape prénom — et la
 * page à rouvrir reste dans l'URL.
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockTraductionsServeur } from '@/test/intl';

const moi = vi.fn();
const profils = vi.fn();

vi.mock('next-intl/server', () => mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  redirect: (cible: string) => {
    throw new Error(`NEXT_REDIRECT ${cible}`);
  },
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => moi() }));
vi.mock('@/app/actions/profiles', () => ({ getMyProfilesAction: () => profils() }));
vi.mock('@/components/onboarding/EtapePrenom', () => ({ EtapePrenom: () => <p>[étape prénom]</p> }));
vi.mock('@/components/onboarding/orientation/Orientation', () => ({ Orientation: () => <p>[orientation]</p> }));
vi.mock('@/components/onboarding/OnboardingShell', () => ({
  OnboardingShell: ({ pas, children }: { readonly pas?: number; readonly children: ReactNode }) => (
    <main data-pas={pas}>{children}</main>
  ),
}));

const { default: PageDIntention } = await import('../page');

beforeEach(() => {
  moi.mockReset();
  profils.mockReset();
  profils.mockResolvedValue([]);
});

describe('/onboarding/intention après la création par e-mail', () => {
  it('un compte sans prénom (créé avec l’adresse et le mot de passe seuls) : l’étape prénom', async () => {
    moi.mockResolvedValue({ id: 9, email: 'awa@example.com', first_name: null, last_name: null, email_verified_at: null });
    render(await PageDIntention({ searchParams: Promise.resolve({ redirect: '/properties/villa-ngor?action=reserver' }) }));

    // TCK-2608 — le titre « Comment vous appelez-vous ? » est dans l'écran (`EtapePrenom.test.tsx`), plus dans la coque.
    expect(screen.getByText('[étape prénom]')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('data-pas', '1');
    expect(profils).not.toHaveBeenCalled();
  });

  it('un compte qui a déjà son prénom ne la revoit pas', async () => {
    moi.mockResolvedValue({ id: 9, email: 'awa@example.com', first_name: 'Awa', last_name: null, email_verified_at: null });
    await expect(PageDIntention({ searchParams: Promise.resolve({ redirect: '/properties/villa-ngor?action=reserver' }) })).rejects.toThrow(
      'NEXT_REDIRECT /properties/villa-ngor?action=reserver',
    );
  });
});
