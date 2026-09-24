import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { Agency } from '@/types/agency';

/**
 * Des mocks à IDENTITÉ STABLE, comme les vrais hooks : un objet neuf à chaque appel casserait le
 * cache du React Compiler et rendrait un FAUX VERT sous compilation (mesuré, TCK-564 E-repair-1).
 */
const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({
  updateAgencyAction: vi.fn(),
  uploadAgencyLogoAction: vi.fn(),
}));

import { AgencyConfigForm } from '../AgencyConfigForm';

/**
 * TCK-571 — l'aperçu de la devise et l'avertissement SUIVENT le choix.
 *
 * Le formulaire lisait `form.watch('currency')` PENDANT LE RENDU : compilé par le React Compiler
 * (`reactCompiler: true`), l'aperçu « 100 000 sera affiché : … » restait dans la devise d'origine
 * et l'avertissement de changement de devise n'apparaissait jamais. Mesuré en rejouant ce fichier
 * sous le compilateur (configuration de mesure hors dépôt, cf. le ticket) : rouge avec `watch()`,
 * vert avec `useWatch`. La revue adverse de TCK-564 l'avait déjà relevé par exécution le
 * 2026-09-23.
 *
 * ⚠ Sans le compilateur, ce fichier est vert AVEC OU SANS le correctif : il décrit le comportement,
 * la garde du motif est `src/test/__tests__/watch-pendant-le-rendu.test.ts`.
 */

const AGENCE: Agency = {
  id: 7,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
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

const sansEspaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]/g, '');

describe('AgencyConfigForm — la devise choisie se reflète tout de suite (TCK-571)', () => {
  it('l’aperçu passe à la devise choisie, et l’avertissement apparaît', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    const apercu = () => screen.getByText(/sera affiché/);
    expect(sansEspaces(apercu().textContent)).toBe('100000seraaffiché:100000FCFA');
    expect(screen.queryByText(/Le changement de devise/)).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'EUR (€)' }));

    expect(sansEspaces(apercu().textContent)).toBe('100000seraaffiché:100000,00€');
    expect(screen.getByRole('alert')).toHaveTextContent(/Le changement de devise/);
  });

  it('revenir à la devise d’origine retire l’avertissement', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'USD ($)' }));
    expect(screen.getByText(/Le changement de devise/)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'XOF (F CFA)' }));
    expect(screen.queryByText(/Le changement de devise/)).toBeNull();
  });
});
