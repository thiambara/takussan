import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/app/actions/admin-agency', () => ({ updateAgencyAction: vi.fn(), uploadAgencyLogoAction: vi.fn() }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

import { AgencyConfigForm } from '../AgencyConfigForm';

/**
 * TCK-1729 (P133.06, point 3) — « Commission » et « TVA par défaut » montraient les exemples `5` et
 * `18` alors qu'un champ vide vaut 0 % dans les deux calculs (`PayoutCalculator`, `InvoiceService`) :
 * un champ jamais rempli se lisait réglé. L'exemple cède la place à une aide qui le dit.
 */
const AGENCE = {
  id: 7, name: 'Dakar Immo', slug: 'dakar-immo', license_number: null, description: null, email: null,
  phone: null, website: null, commission_rate: null, currency: 'XOF', is_verified: true, status: 'active',
  logo_url: null, settings: null, primary_admin_id: null,
} as unknown as Agency;

describe('AgencyConfigForm — taux laissés vides (TCK-1729)', () => {
  it('ni `5` ni `18` en exemple, et l’aide « vide : 0 % » sous chacun des deux champs', () => {
    render(withIntl(<AgencyConfigForm agency={AGENCE} />));

    const commission = screen.getByLabelText(fr.admin.agencyConfig.fields.commission);
    const tva = screen.getByLabelText(fr.admin.agencyConfig.moneyOut.taxRate);
    expect(commission).not.toHaveAttribute('placeholder', '5');
    expect(tva).not.toHaveAttribute('placeholder', '18');
    expect(screen.getAllByText('Laissé vide, ce taux vaut 0 %.')).toHaveLength(2);
  });
});
