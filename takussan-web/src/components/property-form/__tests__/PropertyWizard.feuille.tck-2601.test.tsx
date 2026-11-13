import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2601 — la feuille de compte de l'assistant CONNECTÉ : « Publier » l'ouvre quand il manque
 * quelque chose pour publier, et seulement pour ce qui manque ; rien à compléter → les écritures
 * partent directement. Elle reprend tout ce que collectait le bloc « Vos coordonnées »
 * (`CoordonneesPublication`, inventaire de TCK-633 / TCK-635 / TCK-643). Harnais de
 * `PropertyWizard.publication.tck-633.test.tsx`.
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


const compte = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  setUser: vi.fn(),
  refreshUser: vi.fn(async () => undefined),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: compte.user, setUser: compte.setUser, refreshUser: compte.refreshUser }),
}));

const securite = vi.hoisted(() => ({ envoyer: vi.fn(), verifier: vi.fn() }));
vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...a: unknown[]) => securite.envoyer(...a),
  phoneVerifyOtpAction: (...a: unknown[]) => securite.verifier(...a),
}));
const profil = vi.hoisted(() => ({ ecrire: vi.fn() }));
vi.mock('@/app/actions/contact-preferences', () => ({
  updateContactPreferencesAction: (...a: unknown[]) => profil.ecrire(...a),
}));

import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { PropertyWizard } from '../PropertyWizard';

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};
const AWA = {
  id: 1, first_name: 'Awa', last_name: 'Diop', phone: '+221770000901',
  phone_verified_at: '2026-10-01T00:00:00Z', phone_whatsapp: true, terms_accepted_at: '2026-10-01T00:00:00Z',
};

async function allerAuBout(donnees: Record<string, unknown> = COMPLET) {
  brouillon.etat.draft = { step: 5, data: donnees };
  const user = userEvent.setup();
  render(withIntl(<PropertyWizard />));
  await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
  return user;
}

const feuille = () => screen.getByRole('dialog', { name: 'Dernière étape' });
const ordre = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0];

beforeEach(() => {
  vi.clearAllMocks();
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  compte.user = { ...AWA };
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
  securite.envoyer.mockResolvedValue({ ok: true, data: { codeApercu: null } });
  securite.verifier.mockResolvedValue({ ok: true, data: null });
  profil.ecrire.mockImplementation(async (p: Record<string, unknown>) => ({ ok: true, user: { ...compte.user, ...p } }));
});

describe('PropertyWizard — la feuille de compte (TCK-2601)', () => {
  it('rien à compléter : « Publier » publie directement, sans feuille', async () => {
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(pub.publier).toHaveBeenCalledWith(42, { acceptTerms: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('le nom seul manque (décision 1a) : la feuille ne demande que lui, l’écrit, PUIS les écritures partent', async () => {
    compte.user = { ...AWA, last_name: '' };
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));

    const f = feuille();
    expect(within(f).getByTestId('rappel-de-l-annonce')).toHaveTextContent('Villa à Mbour');
    expect(within(f).queryByLabelText('Prénom')).not.toBeInTheDocument();
    expect(within(f).queryByLabelText('Votre numéro')).not.toBeInTheDocument();
    expect(createPropertyAction).not.toHaveBeenCalled();

    const publierMonAnnonce = within(f).getByRole('button', { name: 'Publier mon annonce' });
    expect(publierMonAnnonce).toBeDisabled();
    await user.type(within(f).getByLabelText('Nom'), 'Diop');
    await user.click(publierMonAnnonce);

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(profil.ecrire).toHaveBeenCalledWith({ last_name: 'Diop' });
    expect(ordre(profil.ecrire)).toBeLessThan(ordre(vi.mocked(createPropertyAction)));
    expect(ordre(vi.mocked(createPropertyAction))).toBeLessThan(ordre(pub.publier));
  });

  it('numéro non vérifié : code, case WhatsApp décochée enregistrée « non », compte relu, puis publication', async () => {
    compte.user = { ...AWA, phone_verified_at: null, phone_whatsapp: null };
    securite.envoyer.mockResolvedValueOnce({ ok: true, data: { codeApercu: '123456' } });
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));

    const f = feuille();
    expect(within(f).getByLabelText('Votre numéro')).toBeInTheDocument();
    const caseWhatsApp = within(f).getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' });
    expect(caseWhatsApp).not.toBeChecked();
    await user.click(within(f).getByRole('button', { name: 'Recevoir un code' }));

    await waitFor(() => expect(securite.envoyer).toHaveBeenCalledWith('+221770000901'));
    expect(await within(f).findByText(/Code envoyé au \+221 77 000 09 01/)).toBeInTheDocument();
    // Le code affiché hors production (« Utiliser ce code ») reste servi.
    await user.click(within(f).getByRole('button', { name: /utiliser ce code/i }));
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    await waitFor(() => expect(pub.publier).toHaveBeenCalled());
    expect(securite.verifier).toHaveBeenCalledWith('123456');
    expect(profil.ecrire).toHaveBeenCalledWith({ phone_whatsapp: false });
    expect(compte.refreshUser).toHaveBeenCalled();
    expect(ordre(securite.verifier)).toBeLessThan(ordre(compte.refreshUser));
    expect(ordre(compte.refreshUser)).toBeLessThan(ordre(profil.ecrire));
    expect(ordre(profil.ecrire)).toBeLessThan(ordre(vi.mocked(createPropertyAction)));
  });

  it('code refusé : dit dans la feuille, rien ne s’écrit', async () => {
    compte.user = { ...AWA, phone_verified_at: null };
    securite.verifier.mockResolvedValueOnce({ ok: false, message: 'Code incorrect.' });
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    const f = feuille();
    await user.click(within(f).getByRole('button', { name: 'Recevoir un code' }));
    fireEvent.change(await within(f).findByLabelText('Code reçu par SMS'), { target: { value: '000000' } });
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    expect(await within(f).findByRole('alert')).toHaveTextContent('Code incorrect.');
    expect(profil.ecrire).not.toHaveBeenCalled();
    expect(createPropertyAction).not.toHaveBeenCalled();
  });

  it('numéro vérifié jamais répondu à WhatsApp : la question seule, une fois ; « non » s’enregistre', async () => {
    compte.user = { ...AWA, phone_whatsapp: null };
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));

    const f = feuille();
    expect(within(f).getByRole('checkbox', { name: 'Le +221 77 000 09 01 reçoit WhatsApp' })).not.toBeChecked();
    expect(within(f).queryByLabelText('Votre numéro')).not.toBeInTheDocument();
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));

    await waitFor(() => expect(pub.publier).toHaveBeenCalled());
    expect(profil.ecrire).toHaveBeenCalledWith({ phone_whatsapp: false });
  });

  it('CGU jamais acceptées : la phrase est sous le bouton de la feuille, et « Publier » les accepte', async () => {
    compte.user = { ...AWA, last_name: '', terms_accepted_at: null };
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    expect(within(feuille()).getByTestId('phrase-cgu-feuille')).toHaveTextContent(/En publiant, vous acceptez/);
  });

  it('« Revenir à l’annonce » referme la feuille, rien ne part', async () => {
    compte.user = { ...AWA, last_name: '' };
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await user.click(within(feuille()).getByRole('button', { name: 'Revenir à l’annonce' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createPropertyAction).not.toHaveBeenCalled();
  });

  it('un formulaire invalide n’ouvre pas la feuille : ses erreurs se montrent, comme avant', async () => {
    compte.user = { ...AWA, last_name: '' };
    const user = await allerAuBout({ ...COMPLET, price: null });
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createPropertyAction).not.toHaveBeenCalled();
  });

  it('l’API dit « numéro non vérifié » au compte que le contexte croit complet : la feuille rouverte le demande', async () => {
    pub.publier.mockResolvedValueOnce({ ok: false, status: 422, message: 'x', missing: ['verified_phone'], contactIsSelf: true });
    const user = await allerAuBout();
    expect(screen.getByTestId('numero-verifie')).toHaveTextContent('+221 77 000 09 01');
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));

    const f = await screen.findByRole('dialog', { name: 'Dernière étape' });
    expect(within(f).getByText(/Il manque encore vos coordonnées pour publier/)).toBeInTheDocument();
    expect(within(f).getByLabelText('Votre numéro')).toBeInTheDocument();
    expect(routeur.push).not.toHaveBeenCalled();
    // L'étape Finition ne présente plus comme vérifié le numéro que l'API dit ne pas l'être.
    expect(screen.queryByTestId('numero-verifie')).not.toBeInTheDocument();

    // Le bien créé n'est pas recréé : la reprise ne rejoue que la publication.
    pub.publier.mockResolvedValueOnce({ ok: true, data: { id: 42, status: 'available' } });
    await user.click(within(f).getByRole('button', { name: 'Recevoir un code' }));
    fireEvent.change(await within(f).findByLabelText('Code reçu par SMS'), { target: { value: '123456' } });
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
    expect(pub.publier).toHaveBeenCalledTimes(2);
  });

  it('le contact du bien est un AUTRE : la feuille le dit, sans rien faire saisir, et ne publie pas', async () => {
    pub.publier.mockResolvedValueOnce({ ok: false, status: 422, message: 'x', missing: ['verified_phone'], contactIsSelf: false });
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));

    const f = await screen.findByRole('dialog', { name: 'Dernière étape' });
    expect(within(f).getByText(/Le contact de ce bien n’a pas encore de prénom/)).toBeInTheDocument();
    expect(within(f).queryByLabelText('Votre numéro')).not.toBeInTheDocument();
    expect(within(f).getByRole('button', { name: 'Publier mon annonce' })).toBeDisabled();

    // Refermée, le bandeau dit la même chose — pas « complétez le bloc Vos coordonnées », parti.
    await user.click(within(f).getByRole('button', { name: 'Revenir à l’annonce' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/Le contact de ce bien n’a pas encore de prénom/);
  });

  it('refus « numéro non vérifié », code accepté puis profil refusé : le compte relu fait foi, « Publier » ne redemande pas le numéro', async () => {
    pub.publier.mockResolvedValueOnce({ ok: false, status: 422, message: 'x', missing: ['verified_phone'], contactIsSelf: true });
    profil.ecrire.mockResolvedValueOnce({ ok: false, message: 'Profil indisponible.' });
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));

    const f = await screen.findByRole('dialog', { name: 'Dernière étape' });
    await user.click(within(f).getByRole('button', { name: 'Recevoir un code' }));
    fireEvent.change(await within(f).findByLabelText('Code reçu par SMS'), { target: { value: '123456' } });
    await user.click(within(f).getByRole('button', { name: 'Publier mon annonce' }));
    expect(await within(f).findByText('Profil indisponible.')).toBeInTheDocument();

    await user.click(within(f).getByRole('button', { name: 'Revenir à l’annonce' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Le bandeau renvoie à la feuille, pas au bloc « Vos coordonnées » qui a quitté l'assistant.
    expect(screen.getByRole('alert')).toHaveTextContent(/Il manque encore vos coordonnées pour publier/);

    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
    expect(pub.publier).toHaveBeenCalledTimes(2);
  });

  it('un refus qui n’est pas faute de coordonnées (quota) : la feuille se referme sur l’avertissement, le bien n’est pas recréé', async () => {
    compte.user = { ...AWA, last_name: '' };
    pub.publier.mockResolvedValueOnce({ ok: false, status: 403, message: 'Quota atteint.', missing: null, contactIsSelf: true });
    const user = await allerAuBout();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await user.type(within(feuille()).getByLabelText('Nom'), 'Diop');
    await user.click(within(feuille()).getByRole('button', { name: 'Publier mon annonce' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Quota atteint.');
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it('l’étape Finition ne saisit plus rien : les numéros vérifiés et la phrase des CGU seulement', async () => {
    compte.user = { ...AWA, phone_verified_at: null, terms_accepted_at: null, secondary_phone: '+221780000902', secondary_phone_verified_at: '2026-10-02T00:00:00Z' };
    await allerAuBout();

    const bloc = screen.getByTestId('coordonnees-publication');
    expect(within(bloc).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(bloc).queryByRole('button')).not.toBeInTheDocument();
    // Le principal, non vérifié, n'est pas présenté comme vérifié ; le second l'est.
    const liste = within(bloc).getByRole('list', { name: 'Vos numéros vérifiés' });
    expect(liste).toHaveTextContent('+221 78 000 09 02');
    expect(liste).not.toHaveTextContent('+221 77 000 09 01');
    expect(within(bloc).getByTestId('phrase-cgu')).toBeInTheDocument();
  });
});
