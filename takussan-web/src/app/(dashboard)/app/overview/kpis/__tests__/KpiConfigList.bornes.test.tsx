/** TCK-1491 (P145.03) — le libellé d'un indicateur porte la borne de l'API (`StoreKpiConfigRequest`, 120). */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('@/app/actions/kpis', () => ({ createKpiConfigAction: vi.fn(), deleteKpiConfigAction: vi.fn() }));

import { KpiConfigList } from '../KpiConfigList';

describe('<KpiConfigList> — bornes de l’API (TCK-1491)', () => {
  it('libellé : maxLength 120', () => {
    render(withIntl(<KpiConfigList initialConfigs={[]} catalog={['leases_active']} />));
    expect((document.getElementById('kpi-label') as HTMLInputElement).maxLength).toBe(120);
  });
});
