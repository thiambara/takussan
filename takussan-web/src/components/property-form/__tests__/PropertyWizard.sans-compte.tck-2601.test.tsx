import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2601 — la feuille de compte SANS compte (`/publish`) : numéro, code, prénom et nom, puis
 * l'annonce en ligne, sans quitter l'assistant. AC1 : au réseau, `verify-code` → profil → espace →
 * création → publication ; le brouillon local ne s'efface qu'après. Un compte existant ne voit rien
 * réécrit ; conditions et second facteur restent dans la feuille ; le drapeau éteint mène à la
 * connexion, l'annonce gardée.
 */
const routeur = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));

type Localisation = {
  city?: string;
  region?: string;
  country_code?: string;
  currency?: string;
} | null;

const geo = vi.hoisted(() => ({
  valeur: null as Localisation,
  loading: false,
}));
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: geo.valeur, loading: geo.loading }),
}));

const brouillon = vi.hoisted(() => ({
  etat: {
    isLoading: false,
    isSaving: false,
    error: null as Error | null,
    draft: null as { step: number; data: Record<string, unknown> | null } | null,
    save: vi.fn(),
    flush: vi.fn(),
    clear: vi.fn(),
  },
}));
vi.mock('@/hooks/useWizardDraft', () => ({ useWizardDraft: () => brouillon.etat }));

const reduction = vi.hoisted(() => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
vi.mock('@/lib/reduire-photo', () => reduction);

vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));

const pub = vi.hoisted(() => ({ publier: vi.fn(), contacts: vi.fn() }));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => pub.publier(...a),
}));
vi.mock('@/app/actions/property-contacts', () => ({
  replacePropertyContactsAction: (...a: unknown[]) => pub.contacts(...a),
}));


/** Un fournisseur d'authentification minimal : `openSession` ouvre VRAIMENT la session (un rendu suit). */
const auth = vi.hoisted(() => ({ ouvrir: vi.fn(), setUser: vi.fn(), refreshUser: vi.fn(async () => undefined) }));
vi.mock('@/context/AuthContext', async () => {
  const React = await import('react');
  const Ctx = React.createContext<{ user: Record<string, unknown> | null; ouvrir: (u: Record<string, unknown>) => void }>({ user: null, ouvrir: () => {} });
  return {
    __Ctx: Ctx,
    useAuth: () => {
      const c = React.useContext(Ctx);
      return {
        user: c.user,
        setUser: (u: Record<string, unknown>) => {
          auth.setUser(u);
          c.ouvrir(u);
        },
        refreshUser: auth.refreshUser,
        openSession: async (_jeton: string, u: Record<string, unknown>) => {
          auth.ouvrir(u);
          c.ouvrir(u);
        },
      };
    },
  };
});

const tel = vi.hoisted(() => ({ demander: vi.fn(), verifier: vi.fn() }));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  demanderCodeTelephone: (...a: unknown[]) => tel.demander(...a),
  verifierCodeTelephone: (...a: unknown[]) => tel.verifier(...a),
}));
const profil = vi.hoisted(() => ({ ecrire: vi.fn() }));
vi.mock('@/app/actions/contact-preferences', () => ({
  updateContactPreferencesAction: (...a: unknown[]) => profil.ecrire(...a),
}));

import * as ModuleAuth from '@/context/AuthContext';
import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { AssistantDePublication, type ModeAnonyme } from '../PropertyWizard';

const Ctx = (ModuleAuth as unknown as { __Ctx: React.Context<{ user: Record<string, unknown> | null; ouvrir: (u: Record<string, unknown>) => void }> }).__Ctx;
function Session({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  return <Ctx.Provider value={{ user, ouvrir: setUser }}>{children}</Ctx.Provider>;
}

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};
const NEUF = { id: 185, first_name: '', last_name: null, phone: '+221770000999', phone_verified_at: '2026-11-13T00:00:00Z', phone_whatsapp: null };

const page = vi.hoisted(() => ({
  surPublier: vi.fn(),
  preparerLEspace: vi.fn(),
  entreeParTelephone: true,
}));

function monter() {
  brouillon.etat.draft = { step: 5, data: COMPLET };
  const anonyme: ModeAnonyme = {
    photosInitiales: [],
    surPhotos: () => {},
    surPublier: page.surPublier,
    depart: { titre: 'Publiez votre bien', sousTitre: '', dessous: null },
    finition: null,
    pourPublierEnPlus: { libelle: 'Votre numéro', note: 'à la fin' },
    surEtape: () => {},
    entreeParTelephone: page.entreeParTelephone,
    preparerLEspace: page.preparerLEspace,
  };
  const user = userEvent.setup();
  render(withIntl(<Session><AssistantDePublication brouillon={brouillon.etat as never} anonyme={anonyme} fraisDAgence={false} /></Session>));
  return user;
}

async function jusquAuCode(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
  await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
  const f = screen.getByRole('dialog', { name: 'Dernière étape : votre numéro' });
  fireEvent.change(within(f).getByLabelText('Votre numéro'), { target: { value: '770000999' } });
  await user.click(within(f).getByRole('button', { name: 'Recevoir un code' }));
  await within(f).findByLabelText('Code reçu par SMS');
  return f;
}

const ordre = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0];

beforeEach(() => {
  vi.clearAllMocks();
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  page.entreeParTelephone = true;
  page.preparerLEspace.mockResolvedValue('pret');
  tel.demander.mockResolvedValue({ attente: 60, codeApercu: '123456' });
  tel.verifier.mockResolvedValue({ token: 't', user: NEUF, is_new_account: true });
  profil.ecrire.mockImplementation(async (p: Record<string, unknown>) => ({ ok: true, user: { ...NEUF, ...p } }));
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
});

describe('PropertyWizard sans compte — la feuille de compte (TCK-2601)', () => {
  it('AC1 — numéro inconnu, code, « Awa » / « Diop » : code → profil → espace → création → publication, puis le brouillon s’efface', async () => {
    const user = monter();
    const f = await jusquAuCode(user);
    expect(tel.demander).toHaveBeenCalledWith('+221770000999', 'fr');

    await user.click(within(f).getByRole('button', { name: /utiliser ce code/i }));
    // Le sixième chiffre ne vérifie rien : le geste « Publier mon annonce » porte aussi les noms.
    expect(tel.verifier).not.toHaveBeenCalled();
    const publierMonAnnonce = within(f).getByRole('button', { name: 'Publier mon annonce' });
    expect(publierMonAnnonce).toBeDisabled();
    await user.type(within(f).getByLabelText('Prénom'), 'Awa');
    await user.type(within(f).getByLabelText('Nom'), 'Diop');
    await user.click(publierMonAnnonce);

    // TCK-2602 — l'espace particulier créé ou rendu actif : l'écran « en ligne », plus la fiche.
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42/en-ligne'));
    expect(tel.verifier).toHaveBeenCalledWith(expect.objectContaining({ phone: '+221770000999', code: '123456' }), 'fr');
    expect(profil.ecrire).toHaveBeenCalledWith({ first_name: 'Awa', last_name: 'Diop', phone_whatsapp: false });
    expect(pub.publier).toHaveBeenCalledWith(42, { acceptTerms: true });
    expect(page.surPublier).not.toHaveBeenCalled();
    const etapes = [tel.verifier, profil.ecrire, page.preparerLEspace, vi.mocked(createPropertyAction), pub.publier, brouillon.etat.clear];
    for (let i = 1; i < etapes.length; i++) expect(ordre(etapes[i - 1]!)).toBeLessThan(ordre(etapes[i]!));
  });

  it('un compte existant (« Awa Diop », WhatsApp oui) : rien de ce qu’il a n’est réécrit', async () => {
    tel.verifier.mockResolvedValueOnce({ token: 't', user: { ...NEUF, first_name: 'Awa', last_name: 'Diop', phone_whatsapp: true }, is_new_account: false });
    const user = monter();
    const f = await jusquAuCode(user);
    await user.click(within(f).getByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(f).getByLabelText('Prénom'), 'Autre');
    await user.type(within(f).getByLabelText('Nom'), 'Nom');
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    await waitFor(() => expect(pub.publier).toHaveBeenCalled());
    expect(profil.ecrire).not.toHaveBeenCalled();
  });

  it('conditions d’un compte né du Radar : la case, puis le même code avec la version, dans la feuille', async () => {
    tel.verifier.mockResolvedValueOnce({ requires_terms: true, terms_version: '2026-11-09' });
    const user = monter();
    const f = await jusquAuCode(user);
    await user.click(within(f).getByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(f).getByLabelText('Prénom'), 'Awa');
    await user.type(within(f).getByLabelText('Nom'), 'Diop');
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    await user.click(await within(f).findByRole('checkbox', { name: /J’accepte les conditions/ }));
    await user.click(within(f).getByRole('button', { name: 'Accepter et continuer' }));
    await waitFor(() => expect(pub.publier).toHaveBeenCalled());
    expect(tel.verifier).toHaveBeenLastCalledWith(expect.objectContaining({ code: '123456', terms_version: '2026-11-09' }), 'fr');
  });

  it('second facteur : le code d’application se saisit dans la feuille', async () => {
    tel.verifier.mockResolvedValueOnce({ requires_2fa: true });
    const user = monter();
    const f = await jusquAuCode(user);
    await user.click(within(f).getByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(f).getByLabelText('Prénom'), 'Awa');
    await user.type(within(f).getByLabelText('Nom'), 'Diop');
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    const champ = await within(f).findByPlaceholderText(/./);
    fireEvent.change(champ, { target: { value: '654321' } });
    await user.click(within(f).getByRole('button', { name: /vérifier/i }));
    await waitFor(() => expect(pub.publier).toHaveBeenCalled());
    expect(tel.verifier).toHaveBeenLastCalledWith(expect.objectContaining({ two_factor_code: '654321' }), 'fr');
  });

  it('code refusé (422) : dit dans la feuille, rien ne s’écrit, l’annonce reste', async () => {
    const { ApiError } = await import('@/lib/api');
    tel.verifier.mockRejectedValueOnce(new ApiError(422, { message: 'x' }));
    const user = monter();
    const f = await jusquAuCode(user);
    await user.click(within(f).getByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(f).getByLabelText('Prénom'), 'Awa');
    await user.type(within(f).getByLabelText('Nom'), 'Diop');
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    expect(await within(f).findByRole('alert')).toBeInTheDocument();
    expect(createPropertyAction).not.toHaveBeenCalled();
    expect(brouillon.etat.clear).not.toHaveBeenCalled();
  });

  it('l’espace ne se prépare pas (refus) : rien n’est créé, l’écran le dit, l’annonce reste ; la seconde tentative rejuge l’espace sans revérifier le code', async () => {
    page.preparerLEspace.mockResolvedValueOnce({ erreur: 'Espace indisponible.' });
    const user = monter();
    const f = await jusquAuCode(user);
    await user.click(within(f).getByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(f).getByLabelText('Prénom'), 'Awa');
    await user.type(within(f).getByLabelText('Nom'), 'Diop');
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Espace indisponible.');
    expect(createPropertyAction).not.toHaveBeenCalled();
    expect(brouillon.etat.clear).not.toHaveBeenCalled();

    // La session est ouverte : « Publier » rejuge l'espace, et publie.
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    // TCK-2602 — l'espace particulier créé ou rendu actif : l'écran « en ligne », plus la fiche.
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42/en-ligne'));
    expect(page.preparerLEspace).toHaveBeenCalledTimes(2);
    expect(tel.verifier).toHaveBeenCalledTimes(1);
  });

  it('AC3 — l’espace est AILLEURS (agence standard, versée au brouillon serveur) : ni création, ni publication, l’annonce reste ici', async () => {
    page.preparerLEspace.mockResolvedValue('ailleurs');
    const user = monter();
    const f = await jusquAuCode(user);
    await user.click(within(f).getByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(f).getByLabelText('Prénom'), 'Awa');
    await user.type(within(f).getByLabelText('Nom'), 'Diop');
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    await waitFor(() => expect(page.preparerLEspace).toHaveBeenCalledWith(expect.objectContaining({ title: COMPLET.title }), 5));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createPropertyAction).not.toHaveBeenCalled();
    expect(pub.publier).not.toHaveBeenCalled();
    expect(page.surPublier).not.toHaveBeenCalled();
    expect(brouillon.etat.clear).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('connexion par numéro éteinte : « Publier » remet l’annonce à la page (la connexion), sans feuille', async () => {
    page.entreeParTelephone = false;
    const user = monter();
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await waitFor(() => expect(page.surPublier).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createPropertyAction).not.toHaveBeenCalled();
  });

  it('le drapeau s’éteint entre l’affichage et l’envoi (404) : la page mène à la connexion, l’annonce gardée', async () => {
    const { ApiError } = await import('@/lib/api');
    tel.demander.mockRejectedValueOnce(new ApiError(404, null));
    const user = monter();
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    const f = screen.getByRole('dialog', { name: 'Dernière étape : votre numéro' });
    fireEvent.change(within(f).getByLabelText('Votre numéro'), { target: { value: '770000999' } });
    await user.click(within(f).getByRole('button', { name: 'Recevoir un code' }));
    await waitFor(() => expect(page.surPublier).toHaveBeenCalled());
    expect(createPropertyAction).not.toHaveBeenCalled();
  });
});
