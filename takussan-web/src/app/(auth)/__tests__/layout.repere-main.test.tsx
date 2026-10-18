/**
 * TCK-896 (P31.03) — les pages d'authentification ont un repère `<main>` : le panneau du formulaire.
 *
 * `AuthPanneau` rendait une grille de `div` ; axe relevait `landmark-one-main` et `region` sur les
 * cinq pages, et un lecteur d'écran n'avait aucun saut vers le formulaire. Le panneau visuel (photo,
 * accroche) reste hors du repère.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/auth/login',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/i18n/messages', async () => ({
  messagesPour: async () => (await import('@/messages/fr.json')).default,
}));

vi.mock('@/components/auth/ReinitialiserSessionClient', () => ({
  ReinitialiserSessionClient: () => null,
}));

const { default: AuthLayout } = await import('../layout');

describe('(auth)/layout — repère <main>', () => {
  it('rend un seul <main>, autour du formulaire, le panneau visuel hors de lui', async () => {
    const { container } = render(withIntl(await AuthLayout({ children: <form aria-label="Connexion" /> })));

    const mains = container.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toContainElement(screen.getByRole('form', { name: 'Connexion' }));
    expect(mains[0].querySelector('h2')).toBeNull();
    expect(container.querySelector('h2')).not.toBeNull();
  });
});
