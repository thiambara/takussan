import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { withIntl } from '@/test/intl';
import type { Agency } from '@/types/agency';

/**
 * TCK-761 (P15.04) — enregistrer les réglages de l'agence (le taux de commission compris) exige
 * la 2FA de l'admin (`AgencyController@update`). L'action serveur ne rendait pas le `code` du
 * refus, et le formulaire ne le confiait à aucune garde : le refus tombait en erreur de formulaire.
 */
const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
const updateAgencyAction = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({
  updateAgencyAction,
  uploadAgencyLogoAction: vi.fn(),
  confirmPayoutThresholdAction: vi.fn(),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

import { AgencyConfigForm } from '../AgencyConfigForm';

const agence: Agency = {
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

describe('AgencyConfigForm — second facteur', () => {
  it('un refus de second facteur ouvre la garde, puis l’enregistrement est rejoué', async () => {
    updateAgencyAction
      .mockResolvedValueOnce({ ok: false, status: 403, message: 'Second facteur requis.', code: 'two_factor_required' })
      .mockResolvedValueOnce({ ok: true, data: agence });
    const garde = vi.fn().mockResolvedValue(true);
    render(
      withIntl(
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <AgencyConfigForm agency={agence} />
        </ContexteGardeDoubleFacteur.Provider>,
      ),
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateAgencyAction).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(screen.queryByText('Second facteur requis.')).toBeNull();
  });
});
