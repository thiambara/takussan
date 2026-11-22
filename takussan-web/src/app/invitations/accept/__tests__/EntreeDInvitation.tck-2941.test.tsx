import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import frMessages from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import { CoqueDEntree, type LibellesDeLaCoque } from '@/components/entree/CoqueDEntree';
import type { ApercuDInvitation } from '@/lib/invitation-apercu';

/**
 * TCK-2941 — la page d'invitation : « Aide » / « Besoin d'aide ? » dans la barre (téléphone public de l'agence),
 * « Modifier » le numéro d'une invitation par SMS (le corrigé part à l'envoi ET à la vérification), les vignettes
 * des biens du bailleur, les essais restants d'un code faux, le compte connecté dans la barre ; AC7 (le bloc
 * « compte existant » d'une invitation par e-mail).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...reste }: React.ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill: _f, sizes: _s, ...reste }: React.ComponentProps<'img'> & { fill?: boolean; sizes?: string }) => <img {...reste} />,
}));
let utilisateur: Record<string, unknown> | null = null;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), user: utilisateur }),
}));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));
vi.mock('@/lib/auth', () => ({ login: vi.fn(), isTwoFactorChallenge: () => false }));
vi.mock('@/components/bookings/useIdentiteParTelephone', () => ({ useDrapeauConnexionParTelephone: () => true }));

const demanderCode = vi.fn();
const verifierCode = vi.fn();
vi.mock('@/lib/invitation-code', () => ({
  demanderCodeDInvitation: (...a: unknown[]) => demanderCode(...a),
  verifierCodeDInvitation: (...a: unknown[]) => verifierCode(...a),
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
  // La saisie brute de l'agence (`agencies.phone` la garde) : l'aide doit la composer en E.164.
  agence: { nom: 'Dakar Immo', logo: null, ville: 'Dakar', biensPublics: 214, verifiee: true, telephone: '33 820 00 00' },
  invitant: 'Aïssatou',
  destinataire: { canal: 'phone', masque: '77 ••• 45 67' },
  compteExistant: false,
  codeSeul: false,
  expireLe: '2026-11-17T10:00:00+00:00',
  inviteeLe: '2026-11-10T10:00:00+00:00',
  prerempli: { prenom: 'Moussa', nom: 'Ndiaye' },
  attente: { biens: 3, intervention: null },
};
const SANS_TELEPHONE: ApercuDInvitation = { ...PAR_SMS, agence: { ...PAR_SMS.agence!, telephone: null } };
const PAR_EMAIL: ApercuDInvitation = { ...PAR_SMS, destinataire: { canal: 'email', masque: 'm•••@gmail.com' } };

function monter(apercu: ApercuDInvitation = PAR_SMS, connecte = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }} largeur="etroite">
          <EntreeDInvitation jeton="jeton-abc" connecte={connecte} apercu={apercu} />
        </CoqueDEntree>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Les deux barres de la coque : celle du téléphone (`lg:hidden`), celle du bureau (`hidden … lg:flex`). */
function barres(container: HTMLElement) {
  const [telephone, bureau] = Array.from(container.querySelectorAll('header'));
  return { telephone: telephone as HTMLElement, bureau: bureau as HTMLElement };
}

beforeEach(() => {
  vi.clearAllMocks();
  utilisateur = null;
  demanderCode.mockResolvedValue({ attente: 60, codeApercu: null, voixDisponible: false });
});

describe('<EntreeDInvitation> — la barre : l’aide de l’agence (AC1)', () => {
  it('téléphone public : « Aide » au téléphone, « Besoin d’aide ? » au bureau, à la place de « Retour au site »', () => {
    const { container } = monter();
    const { telephone, bureau } = barres(container);
    expect(within(telephone).getByRole('button', { name: T.aide.court })).toBeInTheDocument();
    expect(within(bureau).getByRole('button', { name: T.aide.long })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: C.retourAuSite })).toBeNull();
    // La marque reste la sortie.
    expect(within(telephone).getByRole('link', { name: 'Takussan' })).toHaveAttribute('href', '/');
  });

  it('la feuille d’aide offre l’appel (`tel:` en E.164) et WhatsApp (`wa.me`), sans jamais le jeton', async () => {
    const user = userEvent.setup();
    const { container } = monter();
    await user.click(within(barres(container).telephone).getByRole('button', { name: T.aide.court }));
    const feuille = await screen.findByRole('dialog');
    const appel = within(feuille).getByRole('link', { name: 'Appeler Dakar Immo' });
    const whatsapp = within(feuille).getByRole('link', { name: 'Écrire à Dakar Immo sur WhatsApp' });
    expect(appel).toHaveAttribute('href', 'tel:+221338200000');
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221338200000\?text=/);
    expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');
    for (const lien of [appel, whatsapp]) {
      expect(lien.getAttribute('href')).not.toContain('jeton');
      expect(lien.getAttribute('href')).not.toContain('invitations');
    }
  });

  it('sans téléphone public : ni « Aide » ni « Besoin d’aide ? », la barre garde « Retour au site »', () => {
    monter(SANS_TELEPHONE);
    expect(screen.queryByRole('button', { name: T.aide.court })).toBeNull();
    expect(screen.queryByRole('button', { name: T.aide.long })).toBeNull();
    expect(screen.getAllByRole('link', { name: C.retourAuSite }).length).toBeGreaterThan(0);
  });

  it('« Aide » reste dans la barre de l’écran du code (au téléphone, la page y pose la sienne)', async () => {
    const user = userEvent.setup();
    const { container } = monter();
    await user.click(screen.getByRole('button', { name: T.continuer }));
    await screen.findByLabelText(T.code.libelle);
    const enTete = container.querySelector('[data-en-tete-d-entree]') as HTMLElement;
    expect(within(enTete).getByRole('button', { name: T.aide.court })).toBeInTheDocument();
  });
});

describe('<EntreeDInvitation> — « Modifier » le numéro d’une invitation par SMS (AC2)', () => {
  it('le numéro corrigé part à l’envoi du code ET à la vérification', async () => {
    verifierCode.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.numero.modifierLibelle }));
    const champ = screen.getByLabelText(T.numero.libelle);
    expect(champ).toHaveFocus();
    // Rien de saisi : pas encore prêt.
    expect(screen.getByRole('button', { name: T.continuer })).toBeDisabled();
    await user.type(champ, '781112233');
    await user.click(screen.getByRole('button', { name: T.continuer }));
    expect(demanderCode).toHaveBeenCalledWith('jeton-abc', '+221781112233', 'fr');
    expect(await screen.findByText('78 111 22 33')).toBeInTheDocument();

    await user.type(screen.getByLabelText(T.code.libelle), '123456');
    await waitFor(() => expect(verifierCode).toHaveBeenCalledWith('jeton-abc', expect.objectContaining({ code: '123456', phone: '+221781112233' }), 'fr'));
  });

  it('sans correction, aucun `phone` ne part (le numéro de l’invitation)', async () => {
    verifierCode.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: T.continuer }));
    expect(demanderCode).toHaveBeenCalledWith('jeton-abc', null, 'fr');
    await user.type(await screen.findByLabelText(T.code.libelle), '123456');
    await waitFor(() => expect(verifierCode).toHaveBeenCalled());
    expect(verifierCode.mock.calls[0][1]).not.toHaveProperty('phone');
  });

  it('« · Modifier » de l’écran du code ramène au numéro, en correction', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.click(await screen.findByRole('button', { name: T.code.modifier }));
    expect(screen.getByLabelText(T.numero.libelle)).toHaveValue('');
    // Et l'on revient au numéro de l'agence d'un geste.
    await user.click(screen.getByRole('button', { name: 'Garder le numéro donné par Dakar Immo' }));
    expect(screen.queryByRole('textbox', { name: T.numero.libelle })).toBeNull();
    expect(screen.getByRole('button', { name: T.numero.modifierLibelle })).toBeInTheDocument();
  });

  it('invitation partagée (`code_only`) : pas de « Modifier » (l’API refuse la correction)', async () => {
    const user = userEvent.setup();
    monter({ ...PAR_SMS, codeSeul: true });
    expect(screen.queryByRole('button', { name: T.numero.modifierLibelle })).toBeNull();
    await user.click(screen.getByRole('button', { name: T.continuer }));
    await screen.findByLabelText(T.code.libelle);
    expect(screen.queryByRole('button', { name: T.code.modifier })).toBeNull();
  });
});

describe('<EntreeDInvitation> — les vignettes des biens du bailleur (AC3)', () => {
  it('le panneau de l’agence montre la ville et trois vignettes (photo, titre, quartier)', () => {
    const { container } = monter({
      ...PAR_SMS,
      attente: {
        biens: 3,
        intervention: null,
        biensEnAttente: [
          { titre: 'Appartement F4', quartier: 'Mermoz', vignette: 'https://cdn.test/1-thumb.jpg' },
          { titre: 'Studio', quartier: 'Ouakam', vignette: null },
          { titre: 'Villa', quartier: 'Ngor', vignette: 'https://cdn.test/3-thumb.jpg' },
        ],
      },
    });
    const panneau = container.querySelector('[data-objet-de-l-intention]') as HTMLElement;
    expect(within(panneau).getByText('Dakar')).toBeInTheDocument();
    const liste = within(panneau).getByRole('list', { name: T.attente.owner.vignettes });
    const vignettes = within(liste).getAllByRole('listitem');
    expect(vignettes).toHaveLength(3);
    expect(vignettes[0]).toHaveTextContent('Appartement F4Mermoz');
    expect(vignettes[0].querySelector('img')).toHaveAttribute('src', 'https://cdn.test/1-thumb.jpg');
    expect(vignettes[1].querySelector('img')).toBeNull();
  });

  it('un autre rôle n’a pas de vignettes', () => {
    const { container } = monter({ ...PAR_SMS, role: 'agent', attente: { biens: null, intervention: null, biensEnAttente: [{ titre: 'X', quartier: null, vignette: null }] } });
    expect(within(container.querySelector('[data-objet-de-l-intention]') as HTMLElement).queryByRole('list', { name: T.attente.owner.vignettes })).toBeNull();
  });
});

describe('<EntreeDInvitation> — les essais restants d’un code faux (AC5)', () => {
  async function codeFaux(corps: Record<string, unknown>) {
    verifierCode.mockRejectedValue(new ApiError(422, corps));
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.type(await screen.findByLabelText(T.code.libelle), '000000');
    return screen.findByRole('alert');
  }

  it('`attempts_left: 2` : « Il vous reste 2 essais avant d’en demander un autre. »', async () => {
    expect(await codeFaux({ code: 'phone_code_invalid', attempts_left: 2 })).toHaveTextContent('Ce n’est pas le bon code. Il vous reste 2 essais avant d’en demander un autre.');
  });

  it('`attempts_left: 1` : « 1 essai »', async () => {
    expect(await codeFaux({ code: 'phone_code_invalid', attempts_left: 1 })).toHaveTextContent('Ce n’est pas le bon code. Il vous reste 1 essai avant d’en demander un autre.');
  });

  it('`attempts_left: 0` : plus d’essai, un nouveau code', async () => {
    expect(await codeFaux({ code: 'phone_code_invalid', attempts_left: 0 })).toHaveTextContent('Il ne vous reste plus d’essai : demandez un nouveau code.');
  });

  it('sans le champ (ou d’une autre forme) : le message d’avant', async () => {
    expect(await codeFaux({ code: 'phone_code_invalid', attempts_left: '2' })).toHaveTextContent(T.errors.codeInvalide);
  });
});

describe('<EntreeDInvitation> — connecté : le compte dans la barre (AC6)', () => {
  it('les initiales au téléphone, le nom et les initiales au bureau, à la place de « Retour au site » et de l’aide', () => {
    utilisateur = { id: 7, first_name: 'Moussa', last_name: 'Ndiaye', email: 'moussa@example.test', phone: '+221771234567' };
    const { container } = monter(PAR_SMS, true);
    const { telephone, bureau } = barres(container);
    expect(within(telephone).getByText('MN')).toBeInTheDocument();
    expect(within(telephone).getByText('Compte connecté : Moussa Ndiaye')).toBeInTheDocument();
    expect(within(bureau).getByText('Moussa Ndiaye')).toBeInTheDocument();
    expect(within(bureau).getByText('MN')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: C.retourAuSite })).toBeNull();
    expect(screen.queryByRole('button', { name: T.aide.court })).toBeNull();
  });

  it('session pas encore relue : la place est gardée, ni l’aide ni « Retour au site » ne s’y montrent', () => {
    const { container } = monter(PAR_SMS, true);
    expect(within(barres(container).telephone).queryByRole('button', { name: T.aide.court })).toBeNull();
    expect(screen.queryByRole('link', { name: C.retourAuSite })).toBeNull();
  });
});

describe('<EntreeDInvitation> — AC7 : une invitation par e-mail dont l’adresse a déjà un compte', () => {
  it('le bloc « compte existant » et « Me connecter » vers la connexion qui revient à l’invitation', () => {
    monter({ ...PAR_EMAIL, compteExistant: true });
    expect(screen.getByText(T.compteExistant)).toBeInTheDocument();
    const liens = screen.getAllByRole('link', { name: T.meConnecter });
    expect(liens[0].getAttribute('href')).toMatch(/^\/auth\/login\?/);
  });
});
