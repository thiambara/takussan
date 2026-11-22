import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * TCK-2864 (AC6, maquette `ABailleurBureau`) — au bureau, la page des versements du bailleur réunit le
 * bloc « Annuaire public » (`#annuaire`) ; ni le prestataire ni le bailleur aussi agent ne l'ont (ils
 * n'ont pas la rangée de l'annuaire).
 */
const FAITS = vi.hoisted(() => ({ courant: null as unknown }));
vi.mock('@/lib/profil/faits-du-sommaire', () => ({ faitsDuSommaire: async () => FAITS.courant }));
vi.mock('@/components/profile/sommaire/SectionDuProfil', () => ({
  SectionDuProfil: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock('@/components/profile/PayoutMethodsSection', () => ({ PayoutMethodsSection: () => <div data-slot="versements" /> }));
vi.mock('@/components/profile/ProfileDirectorySection', () => ({
  ProfileDirectorySection: ({ listed }: { listed: boolean }) => <div data-slot="annuaire" data-listed={String(listed)} />,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));

const { default: Page } = await import('../page');

const faits = (roles: string[]) => ({
  user: { roles, phone: null, phone_verified_at: null, two_factor_enabled: true, listed_in_public_directory: true, timezone: null },
  profils: [],
  profilActif: null,
});

describe('/app/profile/payouts — versement et annuaire réunis (TCK-2864)', () => {
  it('bailleur : le bloc de l’annuaire suit les versements, ancré, caché au téléphone', async () => {
    FAITS.courant = faits(['owner', 'customer']);
    const { container } = render(await Page());
    const bloc = container.querySelector('#annuaire');
    expect(bloc).not.toBeNull();
    expect(bloc).toHaveClass('max-md:hidden');
    expect(bloc?.querySelector('[data-slot="annuaire"]')).toHaveAttribute('data-listed', 'true');
    expect(container.querySelector('[data-slot="versements"]')!.compareDocumentPosition(bloc!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([[['service_provider', 'customer']], [['owner', 'agent']]])('%j : pas de bloc d’annuaire', async (roles) => {
    FAITS.courant = faits(roles);
    const { container } = render(await Page());
    expect(container.querySelector('#annuaire')).toBeNull();
    expect(container.querySelector('[data-slot="versements"]')).not.toBeNull();
  });
});
