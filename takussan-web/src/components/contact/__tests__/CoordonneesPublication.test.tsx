import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { CoordonneesPublication, manquesLocaux } from '../CoordonneesPublication';

const m = vi.hoisted(() => ({
  maj: vi.fn(),
  envoyer: vi.fn(),
  verifier: vi.fn(),
  setUser: vi.fn(),
  refreshUser: vi.fn(),
  courant: { user: null as Partial<User> | null },
}));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: (p: unknown) => m.maj(p) }));
vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (p?: string) => m.envoyer(p),
  phoneVerifyOtpAction: (c: string) => m.verifier(c),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: m.courant.user, setUser: m.setUser, refreshUser: m.refreshUser }),
}));

const PRET: Partial<User> = {
  id: 1, first_name: 'Awa', last_name: 'Diop', phone: '+221770000901',
  phone_verified_at: '2026-10-01T00:00:00Z', terms_accepted_at: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.courant.user = PRET;
  m.refreshUser.mockResolvedValue(undefined);
});

describe('<CoordonneesPublication> — TCK-633', () => {
  it('rien à demander : le numéro vérifié s’affiche quand même, sans formulaire (TCK-643)', () => {
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));
    expect(screen.getByTestId('numero-verifie')).toHaveTextContent('+221 77 000 09 01');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('CGU jamais acceptées : la phrase et le lien', () => {
    m.courant.user = { ...PRET, terms_accepted_at: null };
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    expect(screen.getByTestId('phrase-cgu')).toHaveTextContent('En publiant, vous acceptez les conditions générales d’utilisation.');
    expect(screen.getByRole('link', { name: 'conditions générales d’utilisation' })).toHaveAttribute('href', expect.stringContaining('/legal/terms'));
  });

  it('sans prénom : le demande et l’enregistre', async () => {
    m.courant.user = { ...PRET, first_name: '' };
    m.maj.mockResolvedValue({ ok: true, user: PRET });
    const user = userEvent.setup();
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    await user.type(screen.getByLabelText('Prénom'), 'Awa');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(m.setUser).toHaveBeenCalledWith(PRET));
    expect(m.maj).toHaveBeenCalledWith({ first_name: 'Awa', last_name: 'Diop' });
  });

  it('sans numéro vérifié : code, vérification, compte relu, WhatsApp enregistré', async () => {
    m.courant.user = { ...PRET, phone: null, phone_verified_at: null };
    m.envoyer.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
    m.verifier.mockResolvedValue({ ok: true, data: null });
    m.maj.mockResolvedValue({ ok: true, user: PRET });
    const user = userEvent.setup();
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    fireEvent.change(screen.getByLabelText('Votre numéro'), { target: { value: '770000901' } });
    await user.click(screen.getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' }));
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
    await waitFor(() => expect(m.envoyer).toHaveBeenCalledWith('+221770000901'));

    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(m.refreshUser).toHaveBeenCalled());
    expect(m.verifier).toHaveBeenCalledWith('123456');
    expect(m.maj).toHaveBeenCalledWith({ phone_whatsapp: true });
  });

  it('numéro vérifié, WhatsApp jamais répondu : la question est posée, et « Non » est une réponse', async () => {
    m.courant.user = { ...PRET, phone_whatsapp: null };
    m.maj.mockResolvedValue({ ok: true, user: { ...PRET, phone_whatsapp: false } });
    const user = userEvent.setup();
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    expect(screen.getByText('Ce numéro reçoit-il WhatsApp ?')).toBeInTheDocument();
    // Le numéro est vérifié : on ne le redemande pas — mais on le MONTRE, sinon la question ne
    // dit pas de quel numéro elle parle (TCK-635, retour du porteur).
    expect(screen.queryByLabelText('Votre numéro')).not.toBeInTheDocument();
    const numero = screen.getByTestId('numero-verifie');
    expect(numero).toHaveTextContent('+221 77 000 09 01');
    expect(numero).toHaveTextContent('Vérifié');
    await user.click(screen.getByRole('button', { name: 'Non' }));

    await waitFor(() => expect(m.maj).toHaveBeenCalledWith({ phone_whatsapp: false }));
    expect(m.setUser).toHaveBeenCalledWith({ ...PRET, phone_whatsapp: false });
  });

  it('WhatsApp jamais répondu : « Oui » s’enregistre', async () => {
    m.courant.user = { ...PRET, phone_whatsapp: null };
    m.maj.mockResolvedValue({ ok: true, user: { ...PRET, phone_whatsapp: true } });
    const user = userEvent.setup();
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    await user.click(screen.getByRole('button', { name: 'Oui' }));

    await waitFor(() => expect(m.maj).toHaveBeenCalledWith({ phone_whatsapp: true }));
  });

  it('WhatsApp déjà répondu « non » : la question ne revient pas', () => {
    m.courant.user = { ...PRET, phone_whatsapp: false };
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));
    expect(screen.queryByText('Ce numéro reçoit-il WhatsApp ?')).not.toBeInTheDocument();
    expect(screen.getByTestId('numero-verifie')).not.toHaveTextContent('WhatsApp');
  });

  it('vérifier le numéro sans cocher WhatsApp enregistre « non », pas « jamais répondu »', async () => {
    m.courant.user = { ...PRET, phone: null, phone_verified_at: null };
    m.envoyer.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
    m.verifier.mockResolvedValue({ ok: true, data: null });
    m.maj.mockResolvedValue({ ok: true, user: PRET });
    const user = userEvent.setup();
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    fireEvent.change(screen.getByLabelText('Votre numéro'), { target: { value: '770000901' } });
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(m.refreshUser).toHaveBeenCalled());
    expect(m.maj).toHaveBeenCalledWith({ phone_whatsapp: false });
  });

  it('le contact est un autre : on le dit, sans formulaire', () => {
    render(withIntl(<CoordonneesPublication manquantsServeur={['verified_phone']} contactEstSoi={false} />));
    expect(screen.getByRole('alert')).toHaveTextContent('Le contact de ce bien n’a pas encore de prénom ou de numéro vérifié');
    expect(screen.queryByLabelText('Votre numéro')).not.toBeInTheDocument();
  });
});

/**
 * TCK-633 (lot C, tour 3) — revérification 2, sonde b : le contexte croit le numéro vérifié (changé
 * ailleurs), l'API refuse `[verified_phone]` avec `contact_is_self`. La boîte s'ouvrait VIDE et
 * « Publier » rendait le même refus. Désormais, ce que le serveur dit manquer s'affiche tant que
 * le compte n'a pas été relu, et le compte est relu.
 */
describe('<CoordonneesPublication> — contexte périmé (TCK-633, tour 3)', () => {
  it('le serveur dit « numéro non vérifié », le contexte dit « vérifié » : le champ s’affiche et le compte est relu', async () => {
    render(withIntl(<CoordonneesPublication manquantsServeur={['verified_phone']} contactEstSoi />));

    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
    await waitFor(() => expect(m.refreshUser).toHaveBeenCalledTimes(1));
  });

  it('le serveur dit « prénom » et « CGU » : les deux s’affichent, même si le contexte les croit faits', () => {
    render(withIntl(<CoordonneesPublication manquantsServeur={['first_name', 'terms']} contactEstSoi />));

    expect(screen.getByLabelText('Prénom')).toBeInTheDocument();
    expect(screen.getByTestId('phrase-cgu')).toBeInTheDocument();
  });

  it('une fois le compte relu, c’est lui qui fait foi', async () => {
    // Le MÊME refus d'un rendu à l'autre : les parents le tiennent en état (`useState`), et un
    // nouveau refus est un nouveau tableau.
    const refus = ['verified_phone'];
    const { rerender } = render(withIntl(<CoordonneesPublication manquantsServeur={refus} contactEstSoi />));
    await waitFor(() => expect(m.refreshUser).toHaveBeenCalled());

    // Relu NON vérifié : le champ reste.
    m.courant.user = { ...PRET, phone_verified_at: null };
    rerender(withIntl(<CoordonneesPublication manquantsServeur={refus} contactEstSoi />));
    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();

    // Vérifié depuis (la boîte a relu le compte) : le champ s'efface, sans attendre un nouveau refus.
    m.courant.user = { ...PRET };
    rerender(withIntl(<CoordonneesPublication manquantsServeur={refus} contactEstSoi />));
    expect(screen.queryByLabelText('Votre numéro')).not.toBeInTheDocument();
    expect(m.refreshUser).toHaveBeenCalledTimes(1);
  });

  it('le contrôle : un refus que le contexte couvre déjà ne relit rien', async () => {
    m.courant.user = { ...PRET, phone_verified_at: null };
    render(withIntl(<CoordonneesPublication manquantsServeur={['verified_phone']} contactEstSoi />));

    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.refreshUser).not.toHaveBeenCalled();
  });
});

/**
 * TCK-643 — relevé du porteur (2026-10-14) : un compte dont le ou les numéros sont déjà vérifiés
 * ne voyait RIEN à la dernière étape. Chaque numéro que les visiteurs appelleront s'affiche,
 * formaté, « Vérifié », avec son WhatsApp — selon la règle de l'API (non vide ET vérifié).
 */
describe('<CoordonneesPublication> — les numéros déjà vérifiés (TCK-643)', () => {
  const SECOND: Partial<User> = {
    secondary_phone: '+221780000902', secondary_phone_verified_at: '2026-10-02T00:00:00Z', secondary_phone_whatsapp: true,
  };

  it('AC1 — numéro principal vérifié : listé, formaté, « Vérifié », WhatsApp indiqué', () => {
    m.courant.user = { ...PRET, phone_whatsapp: true };
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    const liste = screen.getByRole('list', { name: 'Vos numéros vérifiés' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1);
    const principal = screen.getByTestId('numero-verifie');
    expect(principal).toHaveTextContent('+221 77 000 09 01');
    expect(principal).toHaveTextContent('Numéro principal');
    expect(principal).toHaveTextContent('Vérifié');
    expect(principal).toHaveTextContent('WhatsApp');
    expect(screen.getByText('Vos coordonnées pour les intéressés')).toBeInTheDocument();
    expect(screen.queryByLabelText('Votre numéro')).not.toBeInTheDocument();
  });

  it('AC2 — second numéro vérifié : les deux sont listés, chacun « Vérifié »', () => {
    m.courant.user = { ...PRET, phone_whatsapp: false, ...SECOND };
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    const items = within(screen.getByRole('list', { name: 'Vos numéros vérifiés' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('+221 77 000 09 01');
    expect(items[0]).not.toHaveTextContent('WhatsApp');
    expect(items[1]).toHaveTextContent('+221 78 000 09 02');
    expect(items[1]).toHaveTextContent('Second numéro');
    expect(items[1]).toHaveTextContent('WhatsApp');
    for (const item of items) expect(item).toHaveTextContent('Vérifié');
    expect(screen.getByText('Les visiteurs vous joindront à ces numéros. Ils ne sont révélés qu’à leur demande.')).toBeInTheDocument();
  });

  it('un second numéro NON vérifié n’est pas listé : l’API ne le servirait pas', () => {
    m.courant.user = { ...PRET, secondary_phone: '+221780000902', secondary_phone_verified_at: null };
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    expect(within(screen.getByRole('list', { name: 'Vos numéros vérifiés' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('+221 78 000 09 02')).not.toBeInTheDocument();
  });

  it('AC3 — principal non vérifié : la saisie du code reste ; le second vérifié est listé seul', () => {
    m.courant.user = { ...PRET, phone_verified_at: null, ...SECOND };
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recevoir un code' })).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Vos numéros vérifiés' })).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Second numéro');
    expect(screen.queryByTestId('numero-verifie')).not.toBeInTheDocument();
  });

  it('le serveur dit le principal non vérifié (contexte périmé) : il n’est pas présenté comme vérifié', () => {
    render(withIntl(<CoordonneesPublication manquantsServeur={['verified_phone']} contactEstSoi />));

    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
    expect(screen.queryByTestId('numero-verifie')).not.toBeInTheDocument();
  });

  it('WhatsApp jamais répondu : la question est posée DANS la ligne du numéro principal', () => {
    m.courant.user = { ...PRET, phone_whatsapp: null, ...SECOND };
    render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));

    expect(within(screen.getByTestId('numero-verifie')).getByText('Ce numéro reçoit-il WhatsApp ?')).toBeInTheDocument();
    expect(screen.getAllByText('Ce numéro reçoit-il WhatsApp ?')).toHaveLength(1);
  });

  it('le contact est un autre : aucun numéro du compte connecté n’est montré', () => {
    m.courant.user = { ...PRET, ...SECOND };
    render(withIntl(<CoordonneesPublication manquantsServeur={['verified_phone']} contactEstSoi={false} />));

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('+221 77 000 09 01')).not.toBeInTheDocument();
    expect(screen.queryByText('+221 78 000 09 02')).not.toBeInTheDocument();
  });
});

/**
 * TCK-643, AC4 — ce que l'écran croit manquer ne change pas : un second numéro vérifié ne
 * remplace JAMAIS le principal (l'API, `PublishReadiness::missing`, ne juge que lui). Table figée
 * sur le comportement d'avant le ticket.
 */
describe('manquesLocaux — inchangé par TCK-643 (AC4)', () => {
  const SECOND = { secondary_phone: '+221780000902', secondary_phone_verified_at: '2026-10-02T00:00:00Z' };
  it.each([
    ['principal vérifié', { ...PRET }, []],
    ['principal + second vérifiés', { ...PRET, ...SECOND }, []],
    ['second vérifié seul', { ...PRET, phone_verified_at: null, ...SECOND }, ['verified_phone']],
    ['rien de vérifié', { ...PRET, phone: null, phone_verified_at: null }, ['verified_phone']],
    ['sans prénom, principal vérifié', { ...PRET, first_name: ' ' }, ['first_name']],
  ] as const)('%s', (_cas, user, attendu) => {
    expect(manquesLocaux(user)).toEqual(attendu);
  });
});
