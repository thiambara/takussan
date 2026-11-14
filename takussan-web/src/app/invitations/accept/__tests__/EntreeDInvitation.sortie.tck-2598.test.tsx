/**
 * TCK-2598 (réserve r2 de la contre-vérification de b055562f7) — l'invitation déclare sa saisie à la
 * coque d'entrée : rien n'est enregistré avant l'envoi, donc des noms CORRIGÉS (comparés au pré-rempli
 * de l'agence, pas au vide), un numéro, un code ou un mot de passe tapés font demander « Retour au
 * site » et la marque. Une page intacte sort sans demander. Et (r1) la marque de l'en-tête de l'écran
 * du code, qui remplace la barre de la coque au téléphone, passe par la même garde.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import frMessages from '@/messages/fr.json';
import type { ApercuDInvitation } from '@/lib/invitation-apercu';
import { CoqueDEntree, type LibellesDeLaCoque } from '@/components/entree/CoqueDEntree';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...reste }: React.ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), user: null }),
}));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));
vi.mock('@/lib/auth', () => ({ login: vi.fn(), isTwoFactorChallenge: () => false }));

let drapeau: boolean | null = true;
vi.mock('@/components/bookings/useIdentiteParTelephone', () => ({ useDrapeauConnexionParTelephone: () => drapeau }));

const demanderCode = vi.fn();
vi.mock('@/lib/invitation-code', () => ({
  demanderCodeDInvitation: (...a: unknown[]) => demanderCode(...a),
  verifierCodeDInvitation: vi.fn(),
}));
vi.mock('@/app/actions/invitations', () => ({ accepterInvitationAction: vi.fn() }));

import { EntreeDInvitation } from '../EntreeDInvitation';

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

const PAR_SMS: ApercuDInvitation = {
  role: 'owner',
  agence: { nom: 'Dakar Immo', logo: null, ville: 'Dakar', biensPublics: 214, verifiee: true, telephone: '+221338200000' },
  invitant: 'Aïssatou',
  destinataire: { canal: 'phone', masque: '77 ••• 45 67' },
  compteExistant: false,
  expireLe: '2026-11-17T10:00:00+00:00',
  inviteeLe: '2026-11-10T10:00:00+00:00',
  prerempli: { prenom: 'Moussa', nom: 'Ndiaye' },
  attente: { biens: 3, intervention: null },
};
const PAR_EMAIL: ApercuDInvitation = { ...PAR_SMS, destinataire: { canal: 'email', masque: 'm•••@gmail.com' } };

/** La page telle que `page.tsx` la monte : sous `OnboardingShell`, donc sous la coque, « Retour au site ». */
function monter(apercu: ApercuDInvitation = PAR_SMS, connecte = false, prerempliDuCompte: { prenom: string; nom: string } | null = null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }} largeur="etroite">
          <EntreeDInvitation jeton="jeton-abc" connecte={connecte} apercu={apercu} prerempliDuCompte={prerempliDuCompte} />
        </CoqueDEntree>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

let clics: { href: string | null; annule: boolean }[] = [];
function enregistrer(evenement: MouseEvent) {
  const lien = (evenement.target as Element).closest('a');
  if (!lien) return;
  clics.push({ href: lien.getAttribute('href'), annule: evenement.defaultPrevented });
  evenement.preventDefault();
}

let fetchEspion: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  drapeau = true;
  clics = [];
  window.addEventListener('click', enregistrer);
  fetchEspion = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('aucun appel réseau attendu'));
  demanderCode.mockResolvedValue({ attente: 60, codeApercu: null });
});
afterEach(() => {
  window.removeEventListener('click', enregistrer);
  fetchEspion.mockRestore();
});

const retourAuSite = () => screen.getAllByRole('link', { name: C.retourAuSite })[0];

/** Clique la sortie : rend vrai si la confirmation s'est ouverte (et la referme par « Rester »). */
function demande(lien: HTMLElement): boolean {
  fireEvent.click(lien);
  const boite = screen.queryByRole('dialog');
  if (!boite) return false;
  expect(within(boite).getByText(T.sortie.reprise)).toBeInTheDocument();
  fireEvent.click(within(boite).getByRole('button', { name: C.sortie.rester }));
  return true;
}

describe('r2 — l’invitation déclare sa saisie', () => {
  it('intacte (noms pré-remplis par l’agence) : « Retour au site » et la marque sortent sans demander', () => {
    monter();
    expect(screen.getByLabelText(T.firstName)).toHaveValue('Moussa');
    expect(demande(retourAuSite())).toBe(false);
    for (const marque of screen.getAllByRole('link', { name: 'Takussan' })) expect(demande(marque)).toBe(false);
    expect(clics.every((clic) => !clic.annule)).toBe(true);
  });

  it('un prénom corrigé : la sortie demande, et dit où reprendre ; la marque aussi (r1)', () => {
    monter();
    fireEvent.change(screen.getByLabelText(T.firstName), { target: { value: 'Moussa Awa' } });
    expect(demande(retourAuSite())).toBe(true);
    for (const marque of screen.getAllByRole('link', { name: 'Takussan' })) expect(demande(marque)).toBe(true);
    expect(clics.every((clic) => clic.annule)).toBe(true);
  });

  it('remis à la valeur de l’agence, plus de saisie', () => {
    monter();
    const prenom = screen.getByLabelText(T.firstName);
    fireEvent.change(prenom, { target: { value: 'Mous' } });
    fireEvent.change(prenom, { target: { value: 'Moussa' } });
    expect(demande(retourAuSite())).toBe(false);
  });

  it('par e-mail, un numéro tapé est une saisie', async () => {
    const user = userEvent.setup();
    monter(PAR_EMAIL);
    expect(demande(retourAuSite())).toBe(false);
    await user.type(screen.getByLabelText(T.numero.libelle), '77');
    expect(demande(retourAuSite())).toBe(true);
  });

  it('la voie mot de passe : un mot de passe tapé est une saisie', async () => {
    drapeau = false;
    const user = userEvent.setup();
    monter(PAR_EMAIL);
    expect(demande(retourAuSite())).toBe(false);
    await user.type(screen.getByLabelText(T.password), 'secret');
    expect(demande(retourAuSite())).toBe(true);
  });

  it('connecté sans nom : des noms corrigés sont une saisie, les noms proposés intacts n’en sont pas', () => {
    monter(PAR_SMS, true, { prenom: 'Moussa', nom: 'Ndiaye' });
    expect(demande(retourAuSite())).toBe(false);
    fireEvent.change(screen.getByLabelText(T.firstName), { target: { value: 'Awa' } });
    expect(demande(retourAuSite())).toBe(true);
  });

  it('r1 — l’écran du code : la marque de son en-tête demande dès qu’un code est tapé', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: T.continuer }));
    const champ = await screen.findByLabelText(T.code.libelle);

    // L'en-tête du code (téléphone) remplace la barre de la coque : sa marque est la seule du téléphone.
    const enTete = document.querySelector('[data-en-tete-d-entree]') as HTMLElement;
    const marqueDuCode = within(enTete).getByRole('link', { name: /Takussan/ });
    expect(demande(marqueDuCode)).toBe(false);

    await user.type(champ, '12');
    expect(demande(marqueDuCode)).toBe(true);
    expect(clics.at(-1)).toEqual({ href: '/', annule: true });
  });
});
