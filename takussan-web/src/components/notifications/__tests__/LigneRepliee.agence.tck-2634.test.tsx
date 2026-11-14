import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AppNotification } from '@/lib/notifications';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import { withIntl } from '@/test/intl';

import { LigneRepliee } from '../LigneRepliee';

/**
 * TCK-2634 (vérification, M2) — dépliée, chaque ligne d'un repli garde le lien dans l'agence de
 * sa cible (TCK-1761) : ouverte sous le profil d'une autre agence, elle bascule d'abord sur le
 * profil de l'agence de l'avis, puis ouvre la page ; sans profil dans cette agence, elle n'est
 * plus un lien. Sans ce test, une sous-ligne en `<Link>` nu restait verte partout.
 */

const push = vi.fn();
const mutateAsync = vi.fn();
let profils: MyProfilesResponse | undefined;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: profils, isLoading: profils === undefined }),
  useSwitchActiveProfile: () => ({ mutateAsync, isPending: false }),
}));

function profil(id: string, type: Profile['type'], agencyId: number): Profile {
  return { id, type, numeric_id: 1, agency_id: agencyId, status: 'active', created_at: null };
}

function intervention(id: number, agencyId: number): AppNotification {
  return {
    id,
    type: 'system',
    code: 'maintenance.closed',
    params: {},
    target: { kind: 'maintenance', id, path: `/app/maintenance/${id}`, agency_id: agencyId },
    title: 'Intervention clôturée',
    body: `Intervention n° ${id}`,
    is_read: false,
    read_at: null,
    created_at: `2026-11-0${id}T08:00:00+00:00`,
  };
}

const MAINTENANT = new Date('2026-11-12T10:00:00Z');

async function deplier() {
  const onOpen = vi.fn();
  const lignes = [intervention(3, 2), intervention(2, 2), intervention(1, 2)];
  render(
    withIntl(
      <ul>
        <LigneRepliee lignes={lignes} onOpen={onOpen} onToggleRead={vi.fn()} onLireTout={vi.fn()} maintenant={MAINTENANT} />
      </ul>,
    ),
  );
  await userEvent.click(screen.getByRole('button', { expanded: false }));
  const depliees = document.querySelectorAll<HTMLElement>('[data-slot="ligne-depliee"]');
  expect(depliees).toHaveLength(3);
  return { onOpen, premiere: depliees[0] };
}

describe('LigneRepliee — une ligne dépliée ouvre dans l’agence de sa cible', () => {
  beforeEach(() => {
    push.mockReset();
    mutateAsync.mockReset().mockResolvedValue({ data: {} });
    profils = {
      data: [profil('owner:29', 'owner', 1), profil('agent:20', 'agent', 2)],
      meta: { active_profile_id: 'owner:29', count: 2 },
    };
  });

  it('sous le profil d’une autre agence : bascule, puis ouvre la page', async () => {
    const { onOpen, premiere } = await deplier();

    await userEvent.click(within(premiere).getByRole('link'));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(mutateAsync).toHaveBeenCalledWith('agent:20');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/maintenance/3'));
  });

  it('sans profil dans l’agence de la cible : la ligne n’est plus un lien', async () => {
    profils = { data: [profil('owner:29', 'owner', 1)], meta: { active_profile_id: 'owner:29', count: 1 } };
    const { premiere } = await deplier();

    expect(within(premiere).queryByRole('link')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
