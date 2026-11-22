import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import { CoqueDEntree, type LibellesDeLaCoque } from '@/components/entree/CoqueDEntree';
import type { InvitationFermee } from '@/lib/invitation-apercu';

/**
 * TCK-2941 (ADR-0094, amendement du 2026-11-15 § 3) — un lien expiré nomme qui invitait (« Awa vous avait
 * invité… ») quand le 410 sert `inviter_first_name` ; sans lui, le texte d'avant (l'agence et la date). Et le
 * téléphone public de l'agence met « Aide » dans la barre, comme sur un lien valide (maquette e2).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...reste }: React.ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));
vi.mock('@/lib/invitation-code', () => ({ demanderNouvelleInvitation: vi.fn() }));

import { EcranFerme } from '../EcranFerme';

const T = frMessages.invitationAccept;
const C = frMessages.coqueDEntree;
const LIBELLES: LibellesDeLaCoque = {
  marque: 'Takussan',
  retourAuSite: C.retourAuSite,
  fermer: C.fermer,
  quitter: C.quitter,
  avancement: C.avancement,
  sortie: C.sortie,
};
const DAKAR = { nom: 'Dakar Immo', logo: null, telephone: '+221338200000' };
const EXPIREE: InvitationFermee = { etat: 'expiree', agence: DAKAR, inviteeLe: '2026-11-03T09:00:00+00:00' };

function monter(fermee: InvitationFermee) {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">
      <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }} largeur="etroite">
        <EcranFerme etat={fermee.etat} fermee={fermee} jeton="jeton-abc" />
      </CoqueDEntree>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('<EcranFerme> — TCK-2941', () => {
  it('AC4 — `inviter_first_name: "Awa"` : « Awa vous avait invité… »', () => {
    monter({ ...EXPIREE, invitant: 'Awa' });
    expect(
      screen.getByText('Awa vous avait invité chez Dakar Immo le 3 nov. Les invitations restent valables 7 jours. Rien n’est perdu : l’agence peut vous en renvoyer une en un geste.'),
    ).toBeInTheDocument();
  });

  it('AC4 — sans le champ : le texte d’avant, avec la date', () => {
    monter(EXPIREE);
    expect(
      screen.getByText('Dakar Immo vous l’a envoyée le 3 nov. Les invitations restent valables 7 jours. Rien n’est perdu : l’agence peut vous en renvoyer une en un geste.'),
    ).toBeInTheDocument();
  });

  it('téléphone public : « Aide » et « Besoin d’aide ? » dans la barre ; sans lui, « Retour au site »', () => {
    const { unmount } = monter(EXPIREE);
    expect(screen.getByRole('button', { name: T.aide.court })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.aide.long })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: C.retourAuSite })).toBeNull();
    unmount();

    monter({ ...EXPIREE, agence: { ...DAKAR, telephone: null } });
    expect(screen.queryByRole('button', { name: T.aide.court })).toBeNull();
    expect(screen.getAllByRole('link', { name: C.retourAuSite }).length).toBeGreaterThan(0);
  });
});
