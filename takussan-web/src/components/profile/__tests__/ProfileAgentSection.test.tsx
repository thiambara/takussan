import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileAgentSection } from '../ProfileAgentSection';
import type { MyProfilesResponse } from '@/types/profile';
import { withIntl } from '@/test/intl';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, refreshUser: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

const profiles: MyProfilesResponse = {
  data: [
    {
      id: 'owner:3', type: 'owner', numeric_id: 3, agency_id: 9,
      agency: { id: 9, name: 'Espace de Awa', slug: 'espace-awa', kind: 'individual' },
      status: 'active', created_at: null,
    },
    {
      id: 'agent:5', type: 'agent', numeric_id: 5, agency_id: 7,
      agency: { id: 7, name: 'Teranga Immo', slug: 'teranga-immo', kind: 'standard' },
      status: 'active', created_at: null,
      license_number: 'AGC-2026-0042', specialty: 'Location meublée',
    },
  ],
  meta: { active_profile_id: 'agent:5', count: 2 },
};

function renderSection(body: MyProfilesResponse) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}>
      <ProfileAgentSection />
    </QueryClientProvider>,
  ));
}

describe('ProfileAgentSection — TCK-1317 (P117.04)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("affiche l'agence, la licence et la spécialité du profil d'agent", async () => {
    renderSection(profiles);

    expect(await screen.findByText('Teranga Immo')).toBeInTheDocument();
    expect(screen.getByText('AGC-2026-0042')).toBeInTheDocument();
    expect(screen.getByText('Location meublée')).toBeInTheDocument();
    expect(screen.queryByText('Non affilié')).not.toBeInTheDocument();
  });

  it("n'offre aucun champ saisissable : rien ne l'enregistrerait", async () => {
    const { container } = renderSection(profiles);

    await screen.findByText('Teranga Immo');
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
  });

  it('dit « Non renseigné » pour une licence ou une spécialité absente', async () => {
    renderSection({
      ...profiles,
      data: [{ ...profiles.data[1], license_number: null, specialty: null }],
    });

    expect(await screen.findByText('Teranga Immo')).toBeInTheDocument();
    expect(screen.getAllByText('Non renseigné')).toHaveLength(2);
  });
});
