/**
 * TCK-2478 (AC6) — l'en-tête d'espace de la barre de `/app` : il nomme l'agence et le persona, et
 * ouvre le sélecteur de profil au clavier. Il vit DANS la barre, donc dans le tiroir mobile, qui
 * recouvre la barre haute : il doit se voir à toutes les largeurs (la variante `barre` du
 * sélecteur, elle, ne montre son libellé qu'à partir de `lg`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import type { User } from '@/types/user';
import { EnTeteDEspace } from '../EnTeteDEspace';

const { etat } = vi.hoisted(() => ({
  etat: { data: undefined as MyProfilesResponse | undefined, isLoading: false },
}));

vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => etat,
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

const TERANGA = { id: 12, name: 'Agence Teranga', slug: 'agence-teranga', kind: 'standard' as const };

const profil = (id: string, type: Profile['type'], agence: Profile['agency'] = TERANGA): Profile => ({
  id,
  type,
  numeric_id: Number(id.split(':')[1]),
  agency_id: agence?.id ?? null,
  agency: agence,
  status: 'active',
  created_at: null,
});

const reponse = (data: Profile[], actif: string | null): MyProfilesResponse => ({
  data,
  meta: { active_profile_id: actif, count: data.length },
});

const utilisateur = { id: 1, roles: ['agency_admin', 'owner', 'customer'] } as unknown as User;

/** Aucune classe `hidden` sur l'élément ni ses ancêtres : visible sous `lg`, donc dans le tiroir. */
function visibleAToutesLargeurs(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    expect(n.classList.contains('hidden'), `classe « hidden » sur ${n.outerHTML.slice(0, 80)}`).toBe(false);
  }
}

describe('<EnTeteDEspace> (TCK-2478, AC6)', () => {
  beforeEach(() => {
    etat.data = undefined;
    etat.isLoading = false;
  });

  it('deux profils : un bouton qui nomme l’agence et le persona, et ouvre le sélecteur au clavier', async () => {
    etat.data = reponse([profil('agency_admin:12', 'agency_admin'), profil('owner:3', 'owner')], 'agency_admin:12');
    render(withIntl(<EnTeteDEspace user={utilisateur} persona="admin-agence" />));

    const bouton = screen.getByRole('button');
    expect(bouton).toHaveAccessibleName(/Agence Teranga/);
    expect(bouton).toHaveAccessibleName(/Administrateur/);
    visibleAToutesLargeurs(bouton);

    const clavier = userEvent.setup();
    await clavier.tab();
    expect(bouton).toHaveFocus();
    await clavier.keyboard('{Enter}');
    expect(await screen.findByTestId('profile-switcher-item-owner:3')).toBeInTheDocument();
  });

  it('un seul profil : une carte statique, sans bouton, qui nomme l’agence et le persona', () => {
    etat.data = reponse([profil('agent:5', 'agent')], 'agent:5');
    render(withIntl(<EnTeteDEspace user={utilisateur} persona="agent" />));

    expect(screen.queryByRole('button')).toBeNull();
    const carte = screen.getByTestId('profile-switcher-static');
    expect(carte).toHaveTextContent('Agence Teranga');
    expect(carte).toHaveTextContent('Agent');
    visibleAToutesLargeurs(carte);
  });

  it('aucun profil (client) : une carte statique « Client », sans agence', () => {
    etat.data = reponse([], null);
    render(withIntl(<EnTeteDEspace user={utilisateur} persona="client" />));

    expect(screen.queryByRole('button')).toBeNull();
    const carte = screen.getByTestId('profile-switcher-static');
    expect(carte).toHaveTextContent(/^Client$/);
    visibleAToutesLargeurs(carte);
  });

  it('chargement : un squelette masqué aux lecteurs d’écran, sans texte', () => {
    etat.isLoading = true;
    const { container } = render(withIntl(<EnTeteDEspace user={utilisateur} persona="client" />));

    const squelette = screen.getByTestId('profile-switcher-loading');
    expect(squelette).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent(/^$/);
  });
});
