import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import { ApiError } from '@/lib/api';

/**
 * TCK-2611 (ADR-0094 § 2, § 4) — un lien qui ne s'ouvre pas le dit tout de suite, et donne l'issue. AC1 :
 * un jeton expiré affiche « Cette invitation a expiré » et le nom de l'agence, SANS aucun champ de saisie.
 */
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));
const demanderNouvelleInvitation = vi.fn();
vi.mock('@/lib/invitation-code', () => ({ demanderNouvelleInvitation: (...a: unknown[]) => demanderNouvelleInvitation(...a) }));

import { EcranFerme, type EtatDuLien } from '../EcranFerme';
import type { InvitationFermee } from '@/lib/invitation-apercu';

const F = frMessages.invitationAccept.ferme;
const DAKAR = { nom: 'Dakar Immo', logo: null, telephone: '+221338200000' };

function monter(etat: EtatDuLien, fermee: InvitationFermee | null = null, jeton: string | null = 'jeton-abc') {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">
      <EcranFerme etat={etat} fermee={fermee} jeton={jeton} />
    </NextIntlClientProvider>,
  );
}

describe('<EcranFerme>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AC1 — expirée : le titre, l’agence et la date, aucun champ ; la demande part en un geste', async () => {
    demanderNouvelleInvitation.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { container } = monter('expiree', { etat: 'expiree', agence: DAKAR, inviteeLe: '2026-11-03T09:00:00+00:00' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(F.expiree.titre);
    // Le texte EXACT : « 3 nov. Les », jamais « 3 nov.. Les » (le point de l'abréviation tient lieu de point final).
    expect(
      screen.getByText('Dakar Immo vous l’a envoyée le 3 nov. Les invitations restent valables 7 jours. Rien n’est perdu : l’agence peut vous en renvoyer une en un geste.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Invitation du 3 nov.')).toBeInTheDocument();
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
    // Le numéro public de l'agence, composable.
    expect(screen.getByRole('link', { name: '33 820 00 00' })).toHaveAttribute('href', 'tel:+221338200000');
    // Rien n'est demandé au rendu.
    expect(demanderNouvelleInvitation).not.toHaveBeenCalled();
    // Le bouton de l'invitation est à 15 px à toute largeur (maquette a-0 à a-3), pas à 16 au bureau.
    const classes = screen.getByRole('button', { name: F.expiree.demander }).className.split(/\s+/);
    expect(classes).toContain('text-corps');
    expect(classes).not.toContain('lg:text-action');
    expect(classes).not.toContain('text-base');

    await user.click(screen.getByRole('button', { name: F.expiree.demander }));

    expect(demanderNouvelleInvitation).toHaveBeenCalledWith('jeton-abc', 'fr');
    expect(await screen.findByRole('status')).toHaveTextContent('Demande envoyée. Dakar Immo peut maintenant vous renvoyer une invitation.');
    expect(screen.queryByRole('button', { name: F.expiree.demander })).not.toBeInTheDocument();
  });

  it('expirée, demande refusée par le limiteur : on le dit, le bouton reste', async () => {
    demanderNouvelleInvitation.mockRejectedValue(new ApiError(429, {}));
    const user = userEvent.setup();
    monter('expiree', { etat: 'expiree', agence: DAKAR, inviteeLe: null });

    await user.click(screen.getByRole('button', { name: F.expiree.demander }));

    expect(await screen.findByRole('alert')).toHaveTextContent(F.expiree.trop);
    expect(screen.getByRole('button', { name: F.expiree.demander })).toBeEnabled();
  });

  it('expirée entre-temps renouvelée ou close (410) : la page se relit', async () => {
    demanderNouvelleInvitation.mockRejectedValue(new ApiError(410, { code: 'invitation.token_sent' }));
    const user = userEvent.setup();
    monter('expiree', { etat: 'expiree', agence: DAKAR, inviteeLe: null });
    await user.click(screen.getByRole('button', { name: F.expiree.demander }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('annulée : « Appeler l’agence » quand son numéro est public', () => {
    monter('annulee', { etat: 'annulee', agence: DAKAR, inviteeLe: null });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(F.annulee.titre);
    expect(screen.getByRole('link', { name: F.annulee.action })).toHaveAttribute('href', 'tel:+221338200000');
  });

  it('annulée, agence sans numéro public : l’accueil', () => {
    monter('annulee', { etat: 'annulee', agence: { ...DAKAR, telephone: null }, inviteeLe: null });
    expect(screen.queryByRole('link', { name: F.annulee.action })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: F.accueil })).toHaveAttribute('href', '/');
  });

  it('déjà acceptée : « Me connecter »', () => {
    monter('acceptee', { etat: 'acceptee', agence: DAKAR, inviteeLe: null });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(F.acceptee.titre);
    expect(screen.getByRole('link', { name: F.acceptee.action })).toHaveAttribute('href', '/auth/login');
  });

  it.each([
    ['inconnue', F.inconnue.titre, F.inconnue.texte],
    ['incomplet', F.incomplet.titre, 'Ce lien d’invitation est incomplet. Rouvrez-le depuis le message reçu.'],
  ] as const)('%s : le dire, et l’accueil', (etat, titre, texte) => {
    const { container } = monter(etat, null, null);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(titre);
    expect(screen.getByText(texte)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: F.accueil })).toHaveAttribute('href', '/');
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('indisponible : réessayer relit la page, sans rien affirmer de l’invitation', async () => {
    const user = userEvent.setup();
    monter('indisponible', null, null);
    await user.click(screen.getByRole('button', { name: F.indisponible.action }));
    expect(refresh).toHaveBeenCalled();
  });
});
