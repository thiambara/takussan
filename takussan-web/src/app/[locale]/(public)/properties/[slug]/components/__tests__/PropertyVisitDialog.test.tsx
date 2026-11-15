/**
 * TCK-2503 — la demande de visite en deux temps : quand (jour + tranche), qui (nom, téléphone),
 * puis l'écran de suite. Reprend les règles de TCK-590 (sans compte, mention de confidentialité,
 * coordonnées retenues, source d'arrivée, bornes de l'API) qui étaient gardées sur l'ancienne boîte.
 *
 * Le navigateur est forcé à Paris AVANT toute date : un vert pris à UTC (= Dakar) ne distinguerait
 * pas « l'après-midi à Dakar » de « l'après-midi dans le navigateur ».
 *
 * L'action serveur est doublée, le crochet `useVisitRequest` est le VRAI : le 422 traverse le même
 * chemin qu'en production jusqu'au champ qui l'affiche.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { PropertyVisitDialog } from '../PropertyVisitDialog';
import type { BienDeLaVisite } from '../visite/RecapDuBien';
import { withIntl } from '@/test/intl';

const submitVisitRequest = vi.fn();
vi.mock('@/app/actions/property', () => ({
  submitVisitRequest: (...args: unknown[]) => submitVisitRequest(...args),
}));

type UtilisateurDeTest = { id: number; full_name: string; first_name: string; last_name: string; phone: string | null };
let authUser: UtilisateurDeTest | null = null;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: authUser, token: null, isLoading: false }),
}));

const BIEN: BienDeLaVisite = {
  slug: 'villa-almadies',
  title: 'Villa 4 chambres aux Almadies',
  photos: [],
  price: 650000,
  currency: 'XOF',
  contract_type: 'rent',
  rent_period: 'monthly',
  location: {
    full: 'Almadies, Dakar',
    street: null,
    quarter: 'Almadies',
    city: 'Dakar',
    region: null,
    country: null,
    postal_code: null,
    latitude: null,
    longitude: null,
  } as BienDeLaVisite['location'],
};

function rendre(props: Partial<React.ComponentProps<typeof PropertyVisitDialog>> = {}) {
  return render(
    withIntl(<PropertyVisitDialog property={BIEN} open onOpenChange={() => {}} {...props} />),
  );
}

function payload(): Record<string, unknown> {
  return submitVisitRequest.mock.calls[0][1] as Record<string, unknown>;
}

async function choisirJeudiApresMidi(user: ReturnType<typeof userEvent.setup>) {
  // Mardi 10 novembre 2026, 08:00 à Dakar : jeudi est le troisième jour proposé.
  await user.click(screen.getByRole('radio', { name: /jeudi/i }));
  await user.click(screen.getByRole('radio', { name: /après-midi/i }));
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
}

describe('<PropertyVisitDialog> — TCK-2503', () => {
  beforeEach(() => {
    submitVisitRequest.mockReset();
    submitVisitRequest.mockResolvedValue({ ok: true });
    authUser = null;
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('écran 1 : le bien en tête, trois jours proposés, une autre date, trois tranches', () => {
    rendre();

    expect(screen.getByText('Villa 4 chambres aux Almadies')).toBeInTheDocument();
    const jours = within(screen.getByRole('group', { name: 'Quel jour ?' })).getAllByRole('radio');
    expect(jours.map((j) => j.closest('label')?.textContent)).toEqual([
      'Aujourd’hui10 nov.',
      'Demain11 nov.',
      'Jeudi12 nov.',
    ]);
    expect(screen.getByRole('button', { name: /autre date/i })).toBeInTheDocument();
    const tranches = within(screen.getByRole('group', { name: 'À quel moment ?' })).getAllByRole('radio');
    expect(tranches).toHaveLength(3);
    // Rien ne part sans jour ni tranche.
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  });

  it('AC2 — « jeudi, après-midi » envoie date + preferred_window=afternoon, sans heure, puis l’écran de suite', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSuccess = vi.fn();
    rendre({ onSuccess, contactName: 'Sokhna Diop' });

    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await waitFor(() => expect(submitVisitRequest).toHaveBeenCalledTimes(1));
    expect(submitVisitRequest.mock.calls[0][0]).toBe('villa-almadies');
    expect(payload()).toMatchObject({
      date: '2026-11-12',
      preferred_window: 'afternoon',
      type: 'in_person',
      visitor_name: 'Awa Diop',
      visitor_phone: '+221771234567',
    });
    expect(payload()).not.toHaveProperty('scheduled_at');
    expect(payload()).not.toHaveProperty('visitor_email');

    expect(await screen.findByText('Demande envoyée')).toBeInTheDocument();
    expect(screen.getByText('Jeudi 12 novembre, l’après-midi — heure à fixer')).toBeInTheDocument();
    expect(screen.getByText('Sokhna Diop reçoit votre demande')).toBeInTheDocument();
    expect(screen.getByText(/par SMS au \+221771234567/)).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
    // Jamais le début de la tranche comme une heure.
    expect(document.body.textContent).not.toMatch(/14[:h]\s?00|14 h(?! –)/);
    // Nom et téléphone retenus pour le contact suivant, sur cet appareil.
    expect(JSON.parse(window.localStorage.getItem('takussan.coordonnees') ?? '{}')).toEqual({
      name: 'Awa Diop',
      phone: '+221771234567',
    });
  });

  it('une tranche déjà entamée aujourd’hui (Dakar) n’est pas choisissable', async () => {
    // 15:00 à Dakar = 16:00 à Paris : le matin et l'après-midi ont commencé, la fin de journée non.
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();

    await user.click(screen.getByRole('radio', { name: /aujourd’hui/i }));
    expect(screen.getByRole('radio', { name: /matin/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /après-midi/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /fin de journée/i })).toBeEnabled();
    expect(screen.getAllByText('Déjà commencé')).toHaveLength(2);

    // Le lendemain, tout est rouvert.
    await user.click(screen.getByRole('radio', { name: /demain/i }));
    expect(screen.getByRole('radio', { name: /après-midi/i })).toBeEnabled();
  });

  it('une tranche choisie qui devient entamée en changeant de jour n’est plus retenue', async () => {
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();

    await user.click(screen.getByRole('radio', { name: /demain/i }));
    await user.click(screen.getByRole('radio', { name: /après-midi/i }));
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: /aujourd’hui/i }));
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  });

  it('le visiteur sans compte : nom, téléphone, e-mail facultatif et la mention de confidentialité', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);

    expect(screen.queryByRole('link', { name: /se connecter/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Votre nom')).toBeInTheDocument();
    expect(screen.getByLabelText('Téléphone')).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/)).toBeInTheDocument();
    expect(screen.getByText('Pas de compte à créer.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/legal\/privacy$/),
    );
    // Le jour et la tranche restent sous les yeux, et se modifient.
    expect(screen.getByText('Jeudi 12 nov. · l’après-midi')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier le jour et le moment' }));
    expect(screen.getByRole('radio', { name: /jeudi/i })).toBeChecked();
  });

  it('connecté : nom et téléphone préremplis depuis le compte, et envoyés', async () => {
    authUser = { id: 5, full_name: 'Moussa Fall', first_name: 'Moussa', last_name: 'Fall', phone: '+221781112233' };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);

    expect(screen.getByLabelText('Votre nom')).toHaveValue('Moussa Fall');
    expect(screen.queryByLabelText(/E-mail/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await waitFor(() => expect(submitVisitRequest).toHaveBeenCalled());
    expect(payload()).toMatchObject({ visitor_name: 'Moussa Fall', visitor_phone: '+221781112233' });
    expect(await screen.findByText(/dans votre espace et par e-mail/)).toBeInTheDocument();
    // Le compte n'écrit rien sur l'appareil.
    expect(window.localStorage.getItem('takussan.coordonnees')).toBeNull();
  });

  it('sans téléphone, rien ne part ; l’erreur décrit le champ et s’annonce (TCK-868)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    const message = 'Indiquez un numéro où l’agent peut vous joindre.';
    expect(await screen.findByText(message)).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Téléphone')).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(screen.getByLabelText('Votre nom')).not.toHaveAttribute('aria-describedby');
    expect(submitVisitRequest).not.toHaveBeenCalled();
  });

  it('un 422 sur la tranche ramène à l’écran 1 et s’affiche sous les tranches', async () => {
    const refus = 'Cette tranche a déjà commencé aujourd’hui : choisissez une tranche plus tardive ou un autre jour.';
    submitVisitRequest.mockResolvedValue({
      ok: false,
      status: 422,
      message: refus,
      errors: { preferred_window: [refus] },
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    const groupe = await screen.findByRole('group', { name: 'À quel moment ?' });
    expect(within(groupe).getByRole('alert')).toHaveTextContent(refus);
    expect(groupe).toHaveAccessibleDescription(expect.stringContaining(refus));
    expect(within(screen.getByRole('group', { name: 'Quel jour ?' })).queryByRole('alert')).not.toBeInTheDocument();
    // Posée sur son champ, l'erreur n'est pas répétée dans le bandeau.
    expect(screen.getAllByText(refus)).toHaveLength(1);
  });

  it('un 422 sur le jour s’affiche sous les jours', async () => {
    const refus = 'Choisissez un jour entre aujourd’hui et les 30 prochains jours.';
    submitVisitRequest.mockResolvedValue({ ok: false, status: 422, message: refus, errors: { date: [refus] } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    const groupe = await screen.findByRole('group', { name: 'Quel jour ?' });
    expect(within(groupe).getByRole('alert')).toHaveTextContent(refus);
  });

  it('un 422 sur le téléphone reste à l’écran 2, sous le téléphone', async () => {
    const refus = 'Ce numéro ne peut pas être joint.';
    submitVisitRequest.mockResolvedValue({ ok: false, status: 422, message: refus, errors: { visitor_phone: [refus] } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    expect(await screen.findByLabelText('Téléphone')).toHaveAccessibleDescription(expect.stringContaining(refus));
    expect(screen.getAllByText(refus)).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Quel jour ?' })).not.toBeInTheDocument();
  });

  it('une erreur sans champ (409 : personne pour lire) s’affiche dans le bandeau', async () => {
    submitVisitRequest.mockResolvedValue({ ok: false, status: 409, message: 'Personne ne peut recevoir cette demande.' });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Personne ne peut recevoir cette demande.');
    expect(screen.queryByText('Demande envoyée')).not.toBeInTheDocument();
  });

  it('le bouton de chaque écran vit HORS de la zone qui défile : il reste toujours visible', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    const defile = (el: HTMLElement) => el.closest('.overflow-y-auto');

    const continuer = screen.getByRole('button', { name: 'Continuer' });
    expect(defile(continuer)).toBeNull();
    expect(defile(screen.getByRole('radio', { name: /jeudi/i }))).not.toBeNull();

    await choisirJeudiApresMidi(user);
    expect(defile(screen.getByRole('button', { name: 'Envoyer la demande' }))).toBeNull();
    expect(defile(screen.getByLabelText('Votre nom'))).not.toBeNull();
  });

  it('le type de visite se replie (sur place par défaut) ; les quatre restent choisissables', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);

    const deplier = screen.getByRole('button', { name: /autre format/i });
    expect(deplier).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /virtuelle/i })).not.toBeInTheDocument();
    await user.click(deplier);
    for (const nom of [/en personne/i, /virtuelle/i, /autonome/i, /hybride/i]) {
      expect(screen.getByRole('button', { name: nom })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /en personne/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /virtuelle/i }));
    await user.type(screen.getByLabelText(/message/i), 'Plutôt après 15 h');
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await waitFor(() => expect(submitVisitRequest).toHaveBeenCalled());
    expect(payload()).toMatchObject({ type: 'virtual', notes: 'Plutôt après 15 h' });
  });

  it('la source d’arrivée retenue part avec la demande', async () => {
    window.sessionStorage.setItem('takussan.arrivee', JSON.stringify({ source: 'whatsapp', medium: 'share' }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await waitFor(() => expect(submitVisitRequest).toHaveBeenCalled());
    expect(payload()).toMatchObject({ source: 'whatsapp', medium: 'share' });
  });

  it('écran de suite : le dossier quand la fiche en propose un, l’alerte vers les biens comparables', async () => {
    const onPrepareApplication = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre({ onPrepareApplication });
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await user.click(await screen.findByRole('button', { name: /préparer mon dossier/i }));
    expect(onPrepareApplication).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /me prévenir des biens similaires/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/properties\?contract_type=rent&city=Dakar&location=Almadies$/),
    );
  });

  it('écran de suite sans dossier (vente) : pas de « Préparer mon dossier »', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    expect(await screen.findByText('Demande envoyée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /préparer mon dossier/i })).not.toBeInTheDocument();
  });

  it('TCK-1491 — nom du visiteur : maxLength 120 (la borne de l’API)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    expect((screen.getByLabelText('Votre nom') as HTMLInputElement).maxLength).toBe(120);
  });

  it('les tranches ne disent que leur DÉBUT, seule heure que l’API connaisse — aucune fin inventée', () => {
    rendre();
    const groupe = screen.getByRole('group', { name: 'À quel moment ?' });
    expect(within(groupe).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      // Espace insécable : « 14 h » ne se coupe pas dans une carte étroite (mesuré à 360 px).
      'Matinà partir de 9\u00a0h',
      'Après-midià partir de 14\u00a0h',
      'Fin de journéeà partir de 17\u00a0h',
    ]);
    expect(groupe.textContent).not.toMatch(/–|12\s?h|19\s?h/);
    // L'aide ne promet pas que l'heure proposée tombera dans la tranche : rien ne l'y oblige.
    expect(groupe).toHaveAccessibleDescription('L’agence vous propose ensuite une heure précise.');
  });

  it('le focus initial va au premier contrôle de l’écran, pas sur « Fermer »', async () => {
    rendre();
    await waitFor(() => expect(screen.getByRole('radio', { name: /aujourd’hui/i })).toHaveFocus());
  });

  it('boîte ouverte, une tranche qui commence se grise d’elle-même et n’est plus retenue', async () => {
    // 13:58 à Dakar : l'après-midi (14:00) n'a pas commencé.
    vi.setSystemTime(new Date('2026-11-10T13:58:00Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await user.click(screen.getByRole('radio', { name: /aujourd’hui/i }));
    await user.click(screen.getByRole('radio', { name: /après-midi/i }));
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled();

    // 14:01, sans que personne ne touche à rien.
    await act(async () => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    const apresMidi = screen.getByRole('radio', { name: /après-midi/i });
    expect(apresMidi).toBeDisabled();
    expect(apresMidi).not.toBeChecked();
    expect(apresMidi.closest('label')).toHaveTextContent('Déjà commencé');
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  });

  it('le pied de l’écran 1 suit la tranche réellement choisie, et se vide quand elle commence', async () => {
    vi.setSystemTime(new Date('2026-11-10T13:58:00Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    const pied = () => screen.getByRole('button', { name: 'Continuer' }).closest('form')!.querySelector('[aria-live="polite"]')!;

    expect(pied()).toHaveTextContent('Choisissez un jour et un moment.');
    await user.click(screen.getByRole('radio', { name: /aujourd’hui/i }));
    await user.click(screen.getByRole('radio', { name: /après-midi/i }));
    expect(pied()).toHaveTextContent('Mardi 10 nov. · l’après-midi');
    await user.click(screen.getByRole('radio', { name: /fin de journée/i }));
    expect(pied()).toHaveTextContent('Mardi 10 nov. · en fin de journée');
    await user.click(screen.getByRole('radio', { name: /après-midi/i }));

    // 14:01 : l'après-midi a commencé — le pied ne l'annonce plus.
    await act(async () => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    expect(pied()).toHaveTextContent('Choisissez un jour et un moment.');
    expect(pied()).not.toHaveTextContent('après-midi');
  });

  it('au clic, l’heure réelle : une tranche commencée depuis le dernier pas de l’horloge se grise, sans être choisie', async () => {
    vi.setSystemTime(new Date('2026-11-10T13:59:55Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await user.click(screen.getByRole('radio', { name: /aujourd’hui/i }));
    // L'horloge saute à 14:00:05 — avant le prochain pas de la boîte.
    vi.setSystemTime(new Date('2026-11-10T14:00:05Z'));
    await user.click(screen.getByRole('radio', { name: /après-midi/i }));

    const apresMidi = screen.getByRole('radio', { name: /après-midi/i });
    expect(apresMidi).not.toBeChecked();
    expect(apresMidi.closest('label')).toHaveTextContent('Déjà commencé');
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  });

  it('une tranche qui commence pendant qu’on écrit ramène au choix, avec la raison, et rien ne part', async () => {
    vi.setSystemTime(new Date('2026-11-10T13:58:00Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await user.click(screen.getByRole('radio', { name: /aujourd’hui/i }));
    await user.click(screen.getByRole('radio', { name: /après-midi/i }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    vi.setSystemTime(new Date('2026-11-10T14:00:30Z'));
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    const groupe = await screen.findByRole('group', { name: 'À quel moment ?' });
    expect(within(groupe).getByRole('alert')).toHaveTextContent('Ce moment de la journée vient de commencer');
    expect(submitVisitRequest).not.toHaveBeenCalled();
  });

  it('après un envoi, fermer puis rouvrir la boîte repart d’une demande vierge', async () => {
    function Fiche() {
      const [ouverte, setOuverte] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOuverte(true)}>
            Rouvrir
          </button>
          <PropertyVisitDialog property={BIEN} open={ouverte} onOpenChange={setOuverte} />
        </>
      );
    }
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<Fiche />));
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await user.click(await screen.findByRole('button', { name: 'Retour à l’annonce' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Rouvrir' }));
    expect(await screen.findByRole('group', { name: 'Quel jour ?' })).toBeInTheDocument();
    expect(screen.queryByText('Demande envoyée')).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  });

  it('un 422 sur l’e-mail s’affiche une fois, sous l’e-mail — pas dans le bandeau', async () => {
    const refus = 'Cette adresse e-mail n’est pas valide.';
    submitVisitRequest.mockResolvedValue({ ok: false, status: 422, message: refus, errors: { visitor_email: [refus] } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.type(screen.getByLabelText(/E-mail/), 'awa@exemple.sn');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    expect(await screen.findByLabelText(/E-mail/)).toHaveAccessibleDescription(refus);
    expect(screen.getAllByText(refus)).toHaveLength(1);
  });

  it('connecté sans téléphone : le numéro est facultatif, la demande part sans lui', async () => {
    authUser = { id: 6, full_name: 'Moussa Fall', first_name: 'Moussa', last_name: 'Fall', phone: null };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);

    expect(screen.getByText('Téléphone').closest('label')).toHaveTextContent('Téléphone (facultatif)');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await waitFor(() => expect(submitVisitRequest).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ visitor_name: 'Moussa Fall' });
    expect(payload()).not.toHaveProperty('visitor_phone');
    expect(await screen.findByText('Demande envoyée')).toBeInTheDocument();
  });

  it('connecté, un numéro saisi doit rester valide', async () => {
    authUser = { id: 6, full_name: 'Moussa Fall', first_name: 'Moussa', last_name: 'Fall', phone: null };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();
    await choisirJeudiApresMidi(user);
    await user.type(screen.getByLabelText(/Téléphone/), '77');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    expect(await screen.findByText('Indiquez un numéro où l’agent peut vous joindre.')).toHaveAttribute('role', 'alert');
    expect(submitVisitRequest).not.toHaveBeenCalled();
  });

  it('AC3 — le parcours complet se fait au clavier seul', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    rendre();

    // Tabulation jusqu'au premier jour, flèches pour en changer, Espace pour choisir.
    const jeudi = screen.getByRole('radio', { name: /jeudi/i });
    for (let i = 0; i < 10 && document.activeElement?.getAttribute('name') !== jeudi.getAttribute('name'); i += 1) {
      await user.tab();
    }
    expect(document.activeElement).toHaveAttribute('type', 'radio');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(jeudi).toBeChecked();

    // Le groupe des tranches : Tab y entre, la flèche choisit l'après-midi.
    while (document.activeElement?.getAttribute('value') !== 'morning') await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: /après-midi/i })).toBeChecked();
    await user.keyboard('{Enter}');

    // Écran 2 : le focus est sur son titre.
    expect(await screen.findByRole('heading', { name: 'Comment vous joindre ?' })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Votre nom')).toHaveFocus();
    await user.keyboard('Awa Diop');
    await user.tab();
    await user.keyboard('771234567{Enter}');

    await waitFor(() => expect(submitVisitRequest).toHaveBeenCalled());
    expect(payload()).toMatchObject({ date: '2026-11-12', preferred_window: 'afternoon' });
    expect(await screen.findByText('Demande envoyée')).toBeInTheDocument();
  });
});
