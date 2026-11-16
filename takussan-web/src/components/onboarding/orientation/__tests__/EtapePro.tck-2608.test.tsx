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

type Resultat = { ok: true; data: unknown } | { ok: false; status?: number; code?: string; message: string };
// TCK-2938 — « Créer mon espace pro » ouvre une agence (`POST /api/me/agencies`, ADR-0125).
const ouvrirMonAgenceAction = vi.fn(async (_p: unknown): Promise<Resultat> => ({ ok: true, data: { active_profile_id: 'agency_admin:3' } }));
vi.mock('@/app/actions/onboarding', () => ({ ouvrirMonAgenceAction: (p: unknown) => ouvrirMonAgenceAction(p) }));
// TCK-2938 — la ville principale se choisit dans le référentiel (`GET /api/public/geo/cities`).
const VILLES = [
  { id: 7, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: null, longitude: null },
  { id: 9, region_id: 2, name: 'Thiès', slug: 'thies', latitude: null, longitude: null },
];
vi.mock('@/lib/queries/referentiel-public', () => ({
  useVillesDuReferentiel: () => ({ data: { data: VILLES }, isLoading: false }),
}));
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
    codeSeul: false, // TCK-2927
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
 * TCK-2608, TCK-2938 — « Votre agence sur Takussan » : créer son agence (`POST /api/me/agencies`,
 * ADR-0125), ou rejoindre une agence par un lien d'invitation de Takussan seulement.
 */
describe('TCK-2938 — la porte du professionnel : créer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AC2 — « Keur Immo » : l’agence s’ouvre (nom, Dakar du référentiel, numéro du compte), puis /app dans cette agence', async () => {
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    await user.click(bouton(P.creerBouton));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(ouvrirMonAgenceAction).toHaveBeenCalledWith({ name: 'Keur Immo', geo_city_id: 7, phone: '+221771234567' });
    expect(refreshUser).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/app');
  });

  it('AC4 — « Ville principale » est une liste : la ville choisie part par son identifiant', async () => {
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    const ville = screen.getByRole('combobox', { name: P.ville });
    await user.clear(ville);
    await user.type(ville, 'Thi');
    await user.click(await screen.findByRole('option', { name: 'Thiès' }));
    await user.click(bouton(P.creerBouton));
    await waitFor(() => expect(ouvrirMonAgenceAction).toHaveBeenCalledTimes(1));
    expect(ouvrirMonAgenceAction).toHaveBeenCalledWith(expect.objectContaining({ geo_city_id: 9 }));
  });

  it('AC4 — une valeur hors liste n’est pas envoyée', async () => {
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    const ville = screen.getByRole('combobox', { name: P.ville });
    await user.clear(ville);
    await user.type(ville, 'Kédougou-sur-Mer');
    await user.keyboard('{Escape}');
    await user.click(bouton(P.creerBouton));
    await waitFor(() => expect(ouvrirMonAgenceAction).toHaveBeenCalledTimes(1));
    const envoi = ouvrirMonAgenceAction.mock.calls[0]![0] as Record<string, unknown>;
    expect(envoi.geo_city_id ?? null).toBeNull();
    expect(JSON.stringify(envoi)).not.toContain('Kédougou');
  });

  it('AC3 — « Ce que vous aurez » : votre équipe, vos bailleurs, vos mandats ; « En deux temps » sans délai promis, et ce qui attend la vérification', () => {
    const { container } = monter();
    for (const a of ['equipe', 'bailleurs', 'mandats'] as const) {
      expect(screen.getByText(P.avantages[a].titre)).toBeInTheDocument();
    }
    expect(container.textContent).toContain(P.deuxTemps.ensuiteTexte);
    // ADR-0125 § 8 — aucun délai de vérification n'est tenu.
    expect(container.textContent).not.toMatch(/48\s*h/i);
    // ADR-0125 § 5 — l'écran dit ce qui attend la vérification : la mise en ligne et les reversements.
    expect(P.deuxTemps.ensuiteTexte).toMatch(/pas en ligne/);
    expect(P.deuxTemps.ensuiteTexte).toMatch(/reversés après la vérification/);
  });

  it('le téléphone de l’agence se change : le numéro saisi part', async () => {
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    const champ = screen.getByLabelText(P.telephone);
    expect(champ).not.toBeDisabled();
    await user.clear(champ);
    await user.type(champ, '776543210');
    await user.click(bouton(P.creerBouton));
    await waitFor(() => expect(ouvrirMonAgenceAction).toHaveBeenCalledTimes(1));
    expect(ouvrirMonAgenceAction).toHaveBeenCalledWith(expect.objectContaining({ phone: '+221776543210' }));
  });

  it('le compte qui administre déjà une agence ou un espace (409) va à la demande de passage', async () => {
    ouvrirMonAgenceAction.mockResolvedValueOnce({ ok: false, status: 409, code: 'agency.already_admin', message: 'Déjà admin.' });
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    await user.click(bouton(P.creerBouton));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/settings/agency/upgrade?raison_sociale=Keur%20Immo'));
  });

  it('numéro non vérifié côté API (422 agency.phone_unverified) : l’écran l’explique et remontre la vérification', async () => {
    ouvrirMonAgenceAction.mockResolvedValueOnce({ ok: false, status: 422, code: 'agency.phone_unverified', message: 'Vérifiez.' });
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    await user.click(bouton(P.creerBouton));
    expect(await screen.findByRole('alert')).toHaveTextContent(P.numeroNonVerifie);
    expect(screen.getByRole('button', { name: P.numero.envoyer })).toBeInTheDocument();
    expect(bouton(P.creerBouton)).toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('un autre refus de l’API est dit, et rien ne s’ouvre', async () => {
    ouvrirMonAgenceAction.mockResolvedValueOnce({ ok: false, status: 422, code: 'agency.ninea_taken', message: 'NINEA déjà porté.' });
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(new RegExp(P.nom)), 'Keur Immo');
    await user.click(bouton(P.creerBouton));
    expect(await screen.findByRole('alert')).toHaveTextContent('NINEA déjà porté.');
    expect(push).not.toHaveBeenCalled();
  });

  it('sans nom : le champ le dit, aucun appel', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(bouton(P.creerBouton));
    expect(screen.getByText(P.nomRequis)).toBeInTheDocument();
    expect(ouvrirMonAgenceAction).not.toHaveBeenCalled();
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

  it('AC4 (TCK-2938) — l’écran nomme le chemin de l’administrateur : « Équipe, puis « Inviter » »', async () => {
    await rejoindre();
    expect(screen.getByText(/Équipe, puis « Inviter »/)).toBeInTheDocument();
  });

  it('« Pas encore de lien ? » ouvre WhatsApp avec un message prêt', async () => {
    await rejoindre();
    const lien = screen.getByRole('link', { name: P.lien.whatsapp });
    expect(lien.getAttribute('href')).toBe(`https://wa.me/?text=${encodeURIComponent(P.lien.messageWhatsapp)}`);
  });
});
