import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminAiProviders, fetchAdminAiRoles, fetchAdminAiUsages } from '@/lib/queries/super-admin';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { AiUsageRow, PlatformSetting } from '@/types/super-admin';
import { AiRolesPanel } from '../AiRolesPanel';
import { AiUsagesPanel } from '../AiUsagesPanel';
import { SettingsSection } from '../../platform-settings';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAiUsages: vi.fn(),
  fetchAdminAiProviders: vi.fn(),
  fetchAdminAiRoles: vi.fn(),
  patchAdminAiUsage: vi.fn(),
  deleteAdminAiRole: vi.fn(),
  patchPlatformSettings: vi.fn(),
}));

/** TCK-2979 (ADR-0131 § 8) — la console IA nomme les usages du copilote et liste le rôle `transcription`. */

const rendre = (ui: ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>));
};
const ligne = (key: string): AiUsageRow => ({
  key, role: 'redaction', prompt_version: 1, max_data_class: 'personnelle', authority: 'x', enabled: true,
  forced: null, daily_budget_usd: '1', default_daily_budget_usd: '1', spent_today_usd: '0', chain: [],
});

describe('console IA du copilote (TCK-2979)', () => {
  beforeEach(() => {
    vi.mocked(fetchAdminAiProviders).mockReset().mockResolvedValue({ data: [] });
  });

  it('les cinq usages `fil.*` ont leur libellé à côté de la clé ; un autre usage n’en a pas', async () => {
    const cles = ['fil.resume', 'fil.question', 'fil.brouillon', 'fil.promesses', 'fil.transcription'] as const;
    vi.mocked(fetchAdminAiUsages).mockReset().mockResolvedValue({ data: [...cles.map(ligne), ligne('essai.extraction')], meta: { usd_to_xof: '600' } });
    rendre(<AiUsagesPanel />);

    const libelles = fr.superAdmin.pages.ai.usages.copilote.fil;
    for (const [cle, libelle] of [['fil.resume', libelles.resume], ['fil.question', libelles.question], ['fil.brouillon', libelles.brouillon], ['fil.promesses', libelles.promesses], ['fil.transcription', libelles.transcription]]) {
      expect(await screen.findByText(libelle)).toBeInTheDocument();
      expect(screen.getByText(cle)).toBeInTheDocument();
    }
    expect(screen.getByText('essai.extraction').previousElementSibling).toBeNull();
  });

  it('le rôle `transcription` est listé avec son libellé', async () => {
    vi.mocked(fetchAdminAiRoles).mockReset().mockResolvedValue({ data: { roles: [{ role: 'transcription', source: 'config', chain: [], updated_at: null }], providers: [] } });
    rendre(<AiRolesPanel />);

    expect(await screen.findByText(fr.superAdmin.pages.ai.roles.names.transcription)).toBeInTheDocument();
  });

  it('le plafond IA par agence des Paramètres plateforme montre son équivalent en XOF, au taux de la console', async () => {
    vi.mocked(fetchAdminAiUsages).mockReset().mockResolvedValue({ data: [], meta: { usd_to_xof: '600' } });
    const plafond: PlatformSetting = {
      key: 'ai.daily_budget_per_agency_usd', category: 'ai', type: 'decimal', value: '1.5', default_value: null, options: null,
      nullable: true, public: false, requires_restart: false, updated_at: null, updated_by: null,
    };
    rendre(<SettingsSection title="IA" settings={[plafond]} />);

    expect(await screen.findByText(/≈ 900\s*F\s*CFA/)).toBeInTheDocument();
  });
});
