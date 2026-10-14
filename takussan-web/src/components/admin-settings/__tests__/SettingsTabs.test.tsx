import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SettingsTabs } from '../SettingsTabs';

// Composant SERVEUR : `getTranslations` résout la locale via `next/headers`, absent sous jsdom.
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

/**
 * TCK-648 (ADR-0064 §1) — l'onglet « Général » menait à `/admin/settings`, l'éditeur de la table
 * `settings`, page de la PLATEFORME partie dans la console (`/super-admin/settings/global`). La page
 * d'intégrations d'une agence ne doit plus y mener, quel que soit l'acteur : un super-admin trouve
 * les paramètres globaux dans sa console.
 *
 * Le test vaut pour les DEUX valeurs de `canSeeGeneral` : c'est le super-admin (`true`) que l'ancien
 * filtre laissait passer, et c'est donc lui qui rougit si l'onglet revient.
 */
describe('<SettingsTabs>', () => {
  it.each([true, false])(
    'aucun lien vers une page super-admin, même pour un super-admin (canSeeGeneral=%s)',
    async (canSeeGeneral) => {
      render(await SettingsTabs({ active: 'integrations', canSeeGeneral }));

      expect(screen.queryByRole('link', { name: 'Général' })).toBeNull();
      const cibles = screen.getAllByRole('link').map((lien) => lien.getAttribute('href'));
      expect(cibles).not.toContain('/admin/settings');
      expect(cibles.filter((href) => href?.startsWith('/super-admin'))).toEqual([]);
    },
  );

  it('garde l’onglet intégrations, marqué comme page courante', async () => {
    render(await SettingsTabs({ active: 'integrations', canSeeGeneral: true }));

    const integrations = screen.getByRole('link', { name: 'Intégrations' });
    expect(integrations).toHaveAttribute('href', '/admin/settings/integrations');
    expect(integrations).toHaveAttribute('aria-current', 'page');
  });
});
