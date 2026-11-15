import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/onboarding/intention',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const refreshUser = vi.fn(async () => undefined);
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', refreshUser }),
}));

type Resultat = { ok: true; data: unknown } | { ok: false; status?: number; message: string };
const hostIndividualOnboardAction = vi.fn(async (_p: unknown): Promise<Resultat> => ({ ok: true, data: { active_profile_id: 'agency_admin:3' } }));
vi.mock('@/app/actions/onboarding', () => ({ hostIndividualOnboardAction: (p: unknown) => hostIndividualOnboardAction(p) }));
vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));
vi.mock('@/lib/arrivee-de-parcours', () => ({ marquerArriveeDeParcours: vi.fn() }));

const lireInvitation = vi.fn(async (_jeton: string) => ({
  issue: 'valide' as const,
  apercu: {
    role: 'agent',
    agence: { nom: 'Dakar Immo', logo: null, ville: 'Dakar' },
    invitant: 'Mamadou',
    destinataire: null,
    compteExistant: true,
    expireLe: null,
    inviteeLe: '2026-11-09T10:00:00Z',
    prerempli: { prenom: '', nom: '' },
    attente: { biens: null, intervention: null },
  },
}));
vi.mock('@/lib/invitation-apercu', () => ({ lireInvitation: (j: string) => lireInvitation(j) }));

import { CoqueDEntree } from '@/components/entree/CoqueDEntree';

import { EtapePro, type CompteDuPro } from '../EtapePro';

const P = frMessages.onboarding.orientation.pro;
const C = frMessages.coqueDEntree;
const JETON = 'a'.repeat(64);

const VERIFIE: CompteDuPro = {
  telephone: '+221771234567',
  telephoneVerifie: true,
  origineDuSite: 'https://www.takussan.com',
  roles: frMessages.invitationAccept.roles,
};

function monter(compte: CompteDuPro = VERIFIE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <CoqueDEntree libelles={{ marque: 'Takussan', retourAuSite: C.retourAuSite, fermer: C.fermer, quitter: C.quitter, avancement: C.avancement, sortie: C.sortie }}>
          <EtapePro marque="Takussan" compte={compte} onRetour={vi.fn()} />
        </CoqueDEntree>
      </QueryClientProvider>,
    ),
  );
}

/** Le bouton principal est rendu deux fois (pied collé du téléphone, colonne du bureau) : le même geste. */
function bouton(nom: string) {
  const boutons = screen.getAllByRole('button', { name: nom });
  expect(boutons).toHaveLength(2);
  return boutons[0]!;
}

/**
 * TCK-2608 — « Votre agence sur Takussan » : créer un espace (puis la demande de passage en agence,
 * préremplie du nom — AC3), ou rejoindre une agence par un lien d'invitation de Takussan seulement.
 */
describe('TCK-2608 — la porte du professionnel : créer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AC3 — « Keur Immo » : l’espace s’ouvre (host/individual/onboard, XOF, numéro vérifié du compte), puis la demande préremplie', async () => {
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    await user.click(bouton(P.creerBouton));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(hostIndividualOnboardAction).toHaveBeenCalledWith({
      agency: { name: 'Keur Immo', primary_city: 'Dakar', currency: 'XOF' },
      phone_otp: { phone: '+221771234567', code: '' },
      cgu_accepted: true,
    });
    expect(refreshUser).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/app/settings/agency/upgrade?raison_sociale=Keur%20Immo');
  });

  it('AC3 — aucun texte de l’écran n’annonce « équipe » (un espace individuel n’en a pas)', () => {
    const { container } = monter();
    expect(container.textContent).not.toMatch(/équipe/i);
    // …ni un délai que rien ne tient.
    expect(container.textContent).not.toMatch(/48\s*h/i);
  });

  it('le compte qui a déjà un espace (409) va directement à la demande', async () => {
    hostIndividualOnboardAction.mockResolvedValueOnce({ ok: false, status: 409, message: 'Déjà un espace.' });
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    await user.click(bouton(P.creerBouton));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/settings/agency/upgrade?raison_sociale=Keur%20Immo'));
  });

  it('un refus de l’API est dit, et rien ne s’ouvre', async () => {
    hostIndividualOnboardAction.mockResolvedValueOnce({ ok: false, status: 422, message: 'Numéro différent.' });
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    await user.click(bouton(P.creerBouton));
    expect(await screen.findByRole('alert')).toHaveTextContent('Numéro différent.');
    expect(push).not.toHaveBeenCalled();
  });

  it('sans nom : le champ le dit, aucun appel', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(bouton(P.creerBouton));
    expect(screen.getByText(P.nomRequis)).toBeInTheDocument();
    expect(hostIndividualOnboardAction).not.toHaveBeenCalled();
  });

  it('un numéro non vérifié se vérifie ici d’abord : la création attend', () => {
    monter({ ...VERIFIE, telephoneVerifie: false });
    expect(screen.getByRole('button', { name: P.numero.envoyer })).toBeInTheDocument();
    expect(bouton(P.creerBouton)).toBeDisabled();
  });
});

describe('TCK-2608 — la porte du professionnel : rejoindre', () => {
  beforeEach(() => vi.clearAllMocks());

  async function rejoindre() {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('radio', { name: new RegExp(P.rejoindre.titre) }));
    return user;
  }

  it('un lien d’un autre site est refusé : un message, aucune lecture, aucun départ', async () => {
    const user = await rejoindre();
    await user.click(screen.getByLabelText(P.lien.libelle));
    await user.paste(`https://evil.example/invitations/accept?token=${JETON}`);
    expect(screen.getByText(P.lien.refuse)).toBeInTheDocument();
    expect(lireInvitation).not.toHaveBeenCalled();
    expect(bouton(P.lien.rejoindreSans)).toBeDisabled();
  });

  it('un lien de Takussan : l’agence qui invite est lue, puis « Rejoindre Dakar Immo » ouvre la page d’invitation (rien n’est accepté ici)', async () => {
    const user = await rejoindre();
    await user.click(screen.getByLabelText(P.lien.libelle));
    await user.paste(`takussan.com/invitations/accept?token=${JETON}`);
    await waitFor(() => expect(lireInvitation).toHaveBeenCalledWith(JETON));
    const carte = (await screen.findByText('Dakar Immo')).closest('div')!.parentElement!;
    expect(within(carte).getByText(/Vous invite comme agent/)).toBeInTheDocument();
    await user.click(await screen.findAllByRole('button', { name: 'Rejoindre Dakar Immo' }).then((b) => b[0]!));
    expect(push).toHaveBeenCalledWith(`/invitations/accept?token=${JETON}`);
  });

  it('« Pas encore de lien ? » ouvre WhatsApp avec un message prêt', async () => {
    await rejoindre();
    const lien = screen.getByRole('link', { name: P.lien.whatsapp });
    expect(lien.getAttribute('href')).toBe(`https://wa.me/?text=${encodeURIComponent(P.lien.messageWhatsapp)}`);
  });
});
