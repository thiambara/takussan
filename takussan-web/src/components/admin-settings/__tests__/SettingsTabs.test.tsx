import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SettingsTabs } from '../SettingsTabs';

// Composant SERVEUR : `getTranslations` résout la locale via `next/headers`, absent sous jsdom.
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

/**
 * TCK-373 — cette navigation était RECOPIÉE dans les deux pages `/admin/settings*`, l'une avec la
 * première branche active et l'autre avec la seconde. Le test qui compte le plus est donc celui
 * qui vérifie que les DEUX états sortent du même composant : c'est la propriété qu'une recopie
 * ne peut pas tenir.
 */
describe('<SettingsTabs>', () => {
  it('marque l’onglet général comme page courante, et lui seul', async () => {
    render(await SettingsTabs({ active: 'general' }));

    expect(screen.getByRole('link', { name: 'Général' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Intégrations' })).not.toHaveAttribute('aria-current');
  });

  it('marque l’onglet intégrations comme page courante, et lui seul', async () => {
    render(await SettingsTabs({ active: 'integrations' }));

    expect(screen.getByRole('link', { name: 'Intégrations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Général' })).not.toHaveAttribute('aria-current');
  });

  it('pointe sur les deux routes de la section', async () => {
    render(await SettingsTabs({ active: 'general' }));

    expect(screen.getByRole('link', { name: 'Général' })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
    expect(screen.getByRole('link', { name: 'Intégrations' })).toHaveAttribute(
      'href',
      '/admin/settings/integrations',
    );
  });
});
