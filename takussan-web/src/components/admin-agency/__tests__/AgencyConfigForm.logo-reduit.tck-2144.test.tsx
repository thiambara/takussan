import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { Agency } from '@/types/agency';

const ROUTEUR = vi.hoisted(() => ({ refresh: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));

const actions = vi.hoisted(() => ({
  updateAgencyAction: vi.fn(),
  uploadAgencyLogoAction: vi.fn(),
}));
vi.mock('@/app/actions/admin-agency', () => actions);
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));

// La réduction des photos, doublée : le composant n'expose pas les outils d'image.
const reduction = vi.hoisted(() => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotoSousPlafond: vi.fn(async (f: File, _plafond: number) => f),
}));
vi.mock('@/lib/reduire-photo', () => reduction);

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

const DEUX_MO = 2 * 1024 * 1024;

function champLogo(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('#agency-logo')!;
}

/**
 * TCK-2144 (P222.03) — la taille du logo se juge APRÈS la réduction, comme l'avatar (TCK-1887) et
 * `MediaDropzone` (TCK-596) : une photo de 5 Mo qui tombe sous les 2 Mo de l'API une fois réduite
 * n'est pas refusée, et c'est la version réduite qui part.
 */
describe('AgencyConfigForm — logo réduit avant le refus de taille (TCK-2144)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:apercu') }));
    actions.uploadAgencyLogoAction.mockResolvedValue({ ok: true, data: { logo_url: null } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('un logo de 5 Mo réductible sous 2 Mo est accepté et part réduit', async () => {
    const lourd = new File([new Uint8Array(5 * 1024 * 1024)], 'logo.jpg', { type: 'image/jpeg' });
    const leger = new File([new Uint8Array(1024 * 1024)], 'logo.jpg', { type: 'image/jpeg' });
    reduction.reduirePhotoSousPlafond.mockImplementationOnce(async () => leger);

    const { container } = render(withIntl(<AgencyConfigForm agency={agence} />));
    await userEvent.setup().upload(champLogo(container), lourd);

    await waitFor(() => expect(actions.uploadAgencyLogoAction).toHaveBeenCalledTimes(1));
    expect(reduction.reduirePhotoSousPlafond).toHaveBeenCalledWith(lourd, DEUX_MO);
    const envoi = actions.uploadAgencyLogoAction.mock.calls[0][1] as FormData;
    expect(envoi.get('file')).toBe(leger);
    expect(screen.queryByText('Le logo dépasse 2 Mo.')).not.toBeInTheDocument();
  });

  it('un logo qui reste au-dessus de 2 Mo une fois réduit est refusé, sans envoi', async () => {
    const lourd = new File([new Uint8Array(5 * 1024 * 1024)], 'logo.jpg', { type: 'image/jpeg' });

    const { container } = render(withIntl(<AgencyConfigForm agency={agence} />));
    await userEvent.setup().upload(champLogo(container), lourd);

    expect(await screen.findByText('Le logo dépasse 2 Mo.')).toBeInTheDocument();
    expect(actions.uploadAgencyLogoAction).not.toHaveBeenCalled();
  });
});
