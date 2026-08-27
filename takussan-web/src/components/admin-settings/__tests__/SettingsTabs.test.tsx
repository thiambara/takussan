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
    render(await SettingsTabs({ active: 'general', canSeeGeneral: true }));

    expect(screen.getByRole('link', { name: 'Général' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Intégrations' })).not.toHaveAttribute('aria-current');
  });

  it('marque l’onglet intégrations comme page courante, et lui seul', async () => {
    render(await SettingsTabs({ active: 'integrations', canSeeGeneral: true }));

    expect(screen.getByRole('link', { name: 'Intégrations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Général' })).not.toHaveAttribute('aria-current');
  });

  it('pointe sur les deux routes de la section', async () => {
    render(await SettingsTabs({ active: 'general', canSeeGeneral: true }));

    expect(screen.getByRole('link', { name: 'Général' })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
    expect(screen.getByRole('link', { name: 'Intégrations' })).toHaveAttribute(
      'href',
      '/admin/settings/integrations',
    );
  });

  /**
   * TCK-370 — l'onglet « Général » pointe sur `/admin/settings`, qui redirige tout
   * non-super-admin vers `/admin`. Un `agency_admin` arrivé sur les intégrations depuis le menu
   * y trouvait donc un lien qui l'éjectait. Ce test rougit si le filtre disparaît : il ne
   * suffit pas que le lien EXISTE, il faut qu'il n'existe pas pour qui la page rejette.
   */
  it('retire l’onglet général quand l’acteur n’y a pas accès', async () => {
    render(await SettingsTabs({ active: 'integrations', canSeeGeneral: false }));

    expect(screen.queryByRole('link', { name: 'Général' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Intégrations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
