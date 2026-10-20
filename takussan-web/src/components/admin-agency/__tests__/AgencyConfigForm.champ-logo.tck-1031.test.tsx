import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { Agency } from '@/types/agency';

const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({
  updateAgencyAction: vi.fn(),
  uploadAgencyLogoAction: vi.fn(),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

import { AgencyConfigForm } from '../AgencyConfigForm';

const agence: Agency = {
  id: 7,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
  kind: 'standard',
  license_number: null,
  description: null,
  email: null,
  phone: null,
  website: null,
  commission_rate: 5,
  currency: 'XOF',
  is_verified: true,
  status: 'active',
  logo_url: null,
  settings: null,
  primary_admin_id: null,
};

/**
 * TCK-1031 (P68.03) — le champ fichier du logo est un relais : c'est le bouton visible qui porte
 * le geste. En `sr-only` sans `tabIndex={-1}`, il restait dans l'ordre de tabulation, sans nom
 * (axe `label`, « critical ») : au clavier, on tombait sur lui avant le bouton.
 */
describe('AgencyConfigForm — champ fichier du logo (TCK-1031)', () => {
  it("aucun champ fichier n'est à la fois atteignable au clavier et exposé sans nom", () => {
    const { container } = render(withIntl(<AgencyConfigForm agency={agence} />));
    const champs = [...container.querySelectorAll<HTMLInputElement>('input[type="file"]')];
    expect(champs.length).toBeGreaterThan(0);
    for (const champ of champs) {
      const nomme = Boolean(champ.getAttribute('aria-label') || champ.labels?.length);
      const horsTabulation = champ.tabIndex === -1 && champ.getAttribute('aria-hidden') === 'true';
      expect(nomme || horsTabulation, `#${champ.id}`).toBe(true);
    }
  });

  it('le bouton visible ouvre toujours le sélecteur de fichier', async () => {
    const { container } = render(withIntl(<AgencyConfigForm agency={agence} />));
    const champ = container.querySelector<HTMLInputElement>('#agency-logo')!;
    const ouvrir = vi.spyOn(champ, 'click');
    const bouton = champ.nextElementSibling as HTMLElement;
    expect(screen.getAllByRole('button')).toContain(bouton);
    await userEvent.setup().click(bouton);
    expect(ouvrir).toHaveBeenCalledTimes(1);
  });
});
