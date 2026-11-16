import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * TCK-2864 (AC7) — la page des préférences passe à l'écran la persona de la coque (profil actif) ; le
 * super-admin (`plateforme`) n'est pas filtré.
 */
const FAITS = vi.hoisted(() => ({ courant: null as unknown }));
vi.mock('@/lib/profil/faits-du-sommaire', () => ({ faitsDuSommaire: async () => FAITS.courant }));
vi.mock('@/components/profile/sommaire/SectionDuProfil', () => ({
  SectionDuProfil: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock('@/components/profile/NotificationPreferencesMatrix', () => ({
  NotificationPreferencesMatrix: ({ persona }: { persona: string | null }) => <div data-slot="matrice" data-persona={String(persona)} />,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));

const { default: Page } = await import('../page');

const faits = (roles: string[], profilActif: string | null) => ({
  user: { roles, phone: null, phone_verified_at: null, two_factor_enabled: true, listed_in_public_directory: false, timezone: null },
  profils: [],
  profilActif,
});

describe('/app/profile/notifications — la persona (TCK-2864)', () => {
  it.each<[string[], string | null, string]>([
    [['agent', 'owner'], 'agent:1', 'agent'],
    [['agent', 'owner'], 'owner:2', 'bailleur'],
    [['tenant', 'customer'], null, 'locataire'],
    [['super_admin'], null, 'null'],
  ])('%j sous %s → %s', async (roles, actif, attendue) => {
    FAITS.courant = faits(roles, actif);
    const { container } = render(await Page());
    expect(container.querySelector('[data-slot="matrice"]')).toHaveAttribute('data-persona', attendue);
  });
});
