import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { ApiError } from '@/lib/api';
import { quoteBooking } from '@/lib/booking-quote';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '../BookingTunnel';

/**
 * TCK-2510 — le tunnel « Les dates d'abord » : calendrier des nuits, un seul récapitulatif, succès.
 *
 * Il reprend les garanties des quatre fichiers qu'il remplace (`BookingTunnel.echeance`,
 * `.periode-du-loyer`, `.refus-serveur`, `.succes`) : échéance de l'agence et jamais « 48 h »
 * (TCK-575), total selon la période du loyer et aucun montant pour un bien au mois (TCK-530), refus
 * du serveur visibles, total ENREGISTRÉ par l'API au succès.
 */
const mutateAsync = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const nuits = vi.hoisted(() => ({
  etat: { plages: [] as { start: string; end: string }[], etat: 'pret' as 'chargement' | 'pret' | 'erreur' },
  lectures: [] as number[],
}));
const telephone = vi.hoisted(() => ({
  actif: false,
  demander: vi.fn(),
  verifier: vi.fn(),
}));

/** Le compte, partagé par tous les `useAuth()` de l'arbre : `openSession` le change pour tous. */
const auth = vi.hoisted(() => {
  const ecouteurs = new Set<() => void>();
  return {
    user: null as { id: number; name?: string } | null,
    ecouteurs,
    poser(user: { id: number } | null) {
      this.user = user;
      ecouteurs.forEach((f) => f());
    },
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => {
    const user = useSyncExternalStore(
      (f) => {
        auth.ecouteurs.add(f);
        return () => auth.ecouteurs.delete(f);
      },
      () => auth.user,
    );
    return {
      user,
      isLoading: false,
      openSession: async (_token: string, u: { id: number }) => {
        auth.poser(u);
      },
    };
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('@/lib/queries/bookings', () => ({
  useCreateBooking: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('../useNuitsPrises', () => ({
  useNuitsPrises: (_slug: string, _actif: boolean, lecture = 0) => {
    nuits.lectures.push(lecture);
    return nuits.etat;
  },
}));
vi.mock('@/components/contact/WhatsAppButton', () => ({
  WhatsAppButton: ({ children, hasWhatsApp }: { children: ReactNode; hasWhatsApp: boolean }) =>
    hasWhatsApp ? <button type="button">{children}</button> : null,
}));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  connexionParTelephoneActive: async () => telephone.actif,
  demanderCodeTelephone: (...args: unknown[]) => telephone.demander(...args),
  verifierCodeTelephone: (...args: unknown[]) => telephone.verifier(...args),
}));

function bien(rent_period: string, price: number, extra: Record<string, unknown> = {}): PropertyDetail {
  return {
    id: 7,
    slug: 'bien-7',
    title: 'Studio vue mer',
    price,
    currency: 'XOF',
    contract_type: 'rent',
    rent_period,
    rent_period_label: null,
    main_photo_url: null,
    location: { city: 'Dakar', quarter: 'Ngor' },
    owner: { id: 3, name: 'Awa', slug: 'awa-agent', avatar_url: null, is_agent: true, member_since: null },
    primary_contact: null,
    ...extra,
  } as unknown as PropertyDetail;
}

const compact = (text: string | null | undefined) => (text ?? '').replace(/\s/g, '');
const jour = (j: string) => document.querySelector<HTMLButtonElement>(`[data-jour="${j}"]`)!;

function rendre(property: PropertyDetail, locale: LocaleDeTest = 'fr', sejourInitial?: { debut: string | null; fin: string | null; personnes: number }) {
  return render(withIntl(<BookingTunnel property={property} sejourInitial={sejourInitial} />, locale));
}

/** Du 13 au 16 décembre (3 nuits, au départ de la plage prise), puis l'écran du récapitulatif. */
function choisirEtContinuer(debut = '2026-12-13', fin = '2026-12-16', locale: LocaleDeTest = 'fr') {
  fireEvent.click(jour(debut));
  fireEvent.click(jour(fin));
  const libelles = { fr, en, wo }[locale].bookings.tunnel.dates;
  fireEvent.click(screen.getAllByRole('button', { name: libelles.continue })[0]!);
}

function accepterEtEnvoyer(libelle = 'Envoyer la demande') {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getAllByRole('button', { name: libelle })[0]!);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
  mutateAsync.mockReset();
  push.mockReset();
  replace.mockReset();
  nuits.etat = { plages: [{ start: '2026-12-10', end: '2026-12-13' }], etat: 'pret' };
  nuits.lectures = [];
  telephone.actif = false;
  telephone.demander.mockReset();
  telephone.verifier.mockReset();
  auth.user = { id: 1 };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TCK-2510 — le calendrier des nuits', () => {
  it('AC1 — les nuits du 10, 11 et 12 sont barrées et éteintes ; le 13 est une arrivée possible', () => {
    rendre(bien('daily', 20_000));

    for (const j of ['2026-12-10', '2026-12-11', '2026-12-12']) {
      expect(jour(j)).toHaveAttribute('data-pris');
      expect(jour(j)).toBeDisabled();
      expect(jour(j).getAttribute('aria-label')).toContain('nuit déjà réservée');
    }
    expect(jour('2026-12-09')).not.toHaveAttribute('data-pris');
    expect(jour('2026-12-13')).not.toHaveAttribute('data-pris');
    expect(jour('2026-12-13')).toBeEnabled();
    // Le calendrier commence au mois du jour de l'API : aucun jour passé n'est proposé.
    expect(document.querySelector('[data-jour="2026-11-30"]')).toBeNull();
    expect(jour('2026-12-01')).toBeEnabled();
  });

  it('AC1 — arrivée le 9 : un départ le 11 est refusé, le 10 accepté (on part le jour où un autre arrive)', () => {
    rendre(bien('daily', 20_000));
    fireEvent.click(jour('2026-12-09'));

    expect(jour('2026-12-11')).toBeDisabled();
    expect(jour('2026-12-14')).toBeDisabled();
    expect(jour('2026-12-10')).toBeEnabled();

    fireEvent.click(jour('2026-12-10'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('→');
    expect(compact(screen.getByTestId('booking-bar-total').textContent)).toBe(compact('20 000 F CFA'));
  });

  it('l’URL suit le séjour par `replaceState(null, …)` (routeur synchronisé), sans navigation serveur', () => {
    // L'état qu'y pose le routeur de Next au navigateur (sous jsdom, il vaut `null` : le test serait muet).
    window.history.replaceState({ __NA: true }, '', window.location.href);
    const remplacer = vi.spyOn(window.history, 'replaceState');
    rendre(bien('daily', 20_000));
    fireEvent.click(jour('2026-12-13'));
    fireEvent.click(jour('2026-12-16'));

    // `null` et non `window.history.state` : avec l'état de Next (`__NA`), son patch court-circuite
    // le routeur, dont la prochaine action remettait l'URL sans les dates (mesuré au navigateur).
    expect(remplacer).toHaveBeenLastCalledWith(null, '', '/fr/bookings?property=bien-7&debut=2026-12-13&fin=2026-12-16');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    remplacer.mockRestore();
    window.history.replaceState(null, '', window.location.href);
  });

  it('le total de la barre basse suit la sélection', () => {
    rendre(bien('daily', 20_000));
    expect(screen.getByTestId('booking-bar-total')).toHaveTextContent('—');
    expect(screen.getAllByRole('button', { name: 'Continuer' })[0]).toBeDisabled();

    fireEvent.click(jour('2026-12-13'));
    fireEvent.click(jour('2026-12-15'));
    expect(compact(screen.getByTestId('booking-bar-total').textContent)).toBe(compact('40 000 F CFA'));

    fireEvent.click(jour('2026-12-20'));
    fireEvent.click(jour('2026-12-25'));
    expect(compact(screen.getByTestId('booking-bar-total').textContent)).toBe(compact('100 000 F CFA'));
    expect(screen.getAllByRole('button', { name: 'Continuer' })[0]).toBeEnabled();
  });

  it('pendant la lecture des nuits prises, rien ne prétend « les jours barrés sont déjà réservés »', () => {
    nuits.etat = { plages: [], etat: 'chargement' };
    rendre(bien('daily', 20_000));
    expect(screen.getByTestId('booking-dates-hint')).toHaveTextContent('Chargement des disponibilités');
  });

  it('une lecture échouée le dit : les dates seront vérifiées à l’envoi', () => {
    nuits.etat = { plages: [], etat: 'erreur' };
    rendre(bien('daily', 20_000));
    expect(screen.getByTestId('booking-dates-hint')).toHaveTextContent('vérifiées à l’envoi');
  });
});

describe('TCK-2510 — AC2 : le total à l’envoi est celui de booking-quote.ts', () => {
  it.each([
    ['daily', 20_000, '2026-12-13', '2026-12-16'],
    ['daily', 35_333, '2026-12-01', '2026-12-08'],
    ['weekly', 70_000, '2026-12-13', '2026-12-23'],
    ['weekly', 99_999, '2026-12-01', '2026-12-04'],
  ] as const)('%s à %d F, du %s au %s', (period, price, debut, fin) => {
    const property = bien(period, price);
    rendre(property);
    choisirEtContinuer(debut, fin);

    const nombre = Math.round((Date.parse(fin) - Date.parse(debut)) / 86_400_000);
    const attendu = quoteBooking(property, nombre);
    if (attendu.kind !== 'stay') throw new Error('séjour attendu');
    const format = (n: number) => new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF' }).format(n);
    const totaux = screen.getAllByTestId('booking-total').map((n) => compact(n.textContent));
    expect(new Set(totaux)).toEqual(new Set([compact(format(attendu.total))]));
    const acomptes = screen.getAllByTestId('booking-deposit').map((n) => compact(n.textContent));
    expect(new Set(acomptes)).toEqual(new Set([compact(format(attendu.deposit))]));
  });

  it('weekly sur 10 nuits : 100 000 F, au prorata (et non une semaine)', () => {
    rendre(bien('weekly', 70_000));
    choisirEtContinuer('2026-12-13', '2026-12-23');
    expect(compact(screen.getAllByTestId('booking-total')[0]!.textContent)).toBe(compact('100 000 F CFA'));
    expect(screen.getAllByTestId('booking-price-line')[0]).toHaveTextContent('/ semaine, au prorata de 10 nuits');
  });
});

describe('TCK-2510 — AC4 : trois écrans, dates → demande → envoyée', () => {
  it('la demande est dite AVANT l’envoi, puis la réponse de l’API s’affiche', async () => {
    mutateAsync.mockResolvedValue({
      data: { id: 42, reference_number: 'BK-TEST', total_amount: 45_000, deposit_amount: 13_500, currency: 'XOF', start_date: '2026-12-13', end_date: '2026-12-16', response_deadline: null },
    });
    rendre(bien('daily', 20_000));
    expect(screen.queryByText('Récapitulatif')).not.toBeInTheDocument();

    choisirEtContinuer('2026-12-13', '2026-12-16');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Votre demande');
    expect(screen.getByTestId('booking-request-notice')).toHaveTextContent('C’est une demande');
    expect(screen.getByTestId('booking-request-notice')).toHaveTextContent('rien n’est dû');

    accepterEtEnvoyer();

    await screen.findByRole('heading', { level: 1, name: 'Demande envoyée' });
    expect(mutateAsync).toHaveBeenCalledWith({ property_id: 7, start_date: '2026-12-13', end_date: '2026-12-16', guests: 1, notes: undefined });
    // Le total ENREGISTRÉ (45 000), pas l'estimation (60 000) ; l'acompte de l'API.
    expect(compact(screen.getByTestId('booking-success-total').textContent)).toBe('45000FCFA');
    expect(screen.getByText('BK-TEST')).toBeInTheDocument();
    expect(document.body.textContent?.replace(/\s/g, '')).toContain('13500FCFA');
    expect(screen.getByText('Suivre ma demande').closest('a')).toHaveAttribute('href', '/app/bookings/42');
  });

  it('succès : WhatsApp vers le contact quand l’API dit qu’il en a un, à la place de « Retour au bien »', async () => {
    mutateAsync.mockResolvedValue({ data: { id: 43, reference_number: 'BK-WA', total_amount: 60_000, currency: 'XOF', response_deadline: null } });
    rendre(bien('daily', 20_000, { primary_contact: { id: 9, name: 'Sokhna', slug: 'sokhna', is_agent: true, has_whatsapp: true, has_phone: true } }));
    choisirEtContinuer();
    accepterEtEnvoyer();

    await screen.findByRole('heading', { level: 1, name: 'Demande envoyée' });
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(screen.queryByText('Retour au bien')).toBeNull();
  });

  it('succès : sans WhatsApp du contact, « Retour au bien » reste', async () => {
    mutateAsync.mockResolvedValue({ data: { id: 44, reference_number: 'BK-NOWA', total_amount: 60_000, currency: 'XOF', response_deadline: null } });
    rendre(bien('daily', 20_000, { primary_contact: { id: 9, name: 'Sokhna', slug: 'sokhna', is_agent: true, has_whatsapp: false, has_phone: true } }));
    choisirEtContinuer();
    accepterEtEnvoyer();

    await screen.findByRole('heading', { level: 1, name: 'Demande envoyée' });
    expect(screen.queryByRole('button', { name: 'WhatsApp' })).toBeNull();
    expect(screen.getByText('Retour au bien').closest('a')).toHaveAttribute('href', '/fr/properties/bien-7');
  });

  it('« (30 %) » : le signe pour cent ne se sépare pas du nombre (espace insécable)', () => {
    rendre(bien('daily', 20_000));
    choisirEtContinuer();
    const libelle = screen.getAllByText(/Acompte si la demande est confirmée/)[0]!.textContent!;
    expect(libelle).toContain('30 %');
    expect(libelle).not.toMatch(/30 %/);
  });

  it('une session expirée à l’envoi (401) renvoie à la connexion, dates et personnes conservées', async () => {
    mutateAsync.mockRejectedValue(new ApiError(401, { message: 'Unauthenticated.' }));
    rendre(bien('daily', 20_000), 'fr', { debut: '2026-12-13', fin: '2026-12-16', personnes: 3 });
    accepterEtEnvoyer();

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const cible = new URL(String(push.mock.calls[0]![0]), 'http://x');
    expect(cible.pathname).toBe('/auth/login');
    expect(cible.searchParams.get('redirect')).toBe('/fr/bookings?property=bien-7&debut=2026-12-13&fin=2026-12-16&personnes=3');
    expect(screen.queryByRole('heading', { level: 1, name: 'Demande envoyée' })).toBeNull();
  });

  it('les conditions sont exigées avant l’envoi', () => {
    rendre(bien('daily', 20_000));
    choisirEtContinuer();
    fireEvent.click(screen.getAllByRole('button', { name: 'Envoyer la demande' })[0]!);
    expect(screen.getByRole('alert')).toHaveTextContent('Acceptez les conditions');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('les personnes et le message partent avec la demande', async () => {
    mutateAsync.mockResolvedValue({ data: { id: 1, reference_number: 'X', total_amount: 1, currency: 'XOF', response_deadline: null } });
    rendre(bien('daily', 20_000));
    fireEvent.click(screen.getByRole('button', { name: 'Une personne de plus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Une personne de plus' }));
    choisirEtContinuer();
    fireEvent.change(screen.getByLabelText(/Un mot pour/), { target: { value: '  Arrivée vers 20 h  ' } });
    accepterEtEnvoyer();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ guests: 3, notes: 'Arrivée vers 20 h' });
  });
});

describe('TCK-2510 — l’échéance de l’agence, jamais « 48 h » (TCK-575)', () => {
  function reponse(response_deadline: string | null) {
    return { data: { id: 42, reference_number: 'BK-TEST', total_amount: 60_000, currency: 'XOF', response_deadline } };
  }

  it('affiche l’échéance rendue par l’API, à l’heure de Dakar', async () => {
    mutateAsync.mockResolvedValue(reponse('2026-12-04T12:30:00+00:00'));
    rendre(bien('daily', 20_000));
    choisirEtContinuer();
    accepterEtEnvoyer();

    const echeance = await screen.findByTestId('booking-success-deadline');
    expect(echeance).toHaveTextContent("jusqu'au vendredi 4 décembre 2026");
    expect(echeance).toHaveTextContent('12:30');
    expect(echeance).toHaveTextContent('expire automatiquement');
    expect(document.body.textContent).not.toMatch(/48\s?h/);
  });

  it('suit la locale : en anglais, la même échéance en anglais', async () => {
    mutateAsync.mockResolvedValue(reponse('2026-12-04T12:30:00+00:00'));
    rendre(bien('daily', 20_000), 'en');
    choisirEtContinuer('2026-12-13', '2026-12-16', 'en');
    accepterEtEnvoyer(en.bookings.tunnel.recap.submit);

    const echeance = await screen.findByTestId('booking-success-deadline');
    expect(echeance).toHaveTextContent(/has until Friday,? 4 December 2026/);
    expect(echeance).not.toHaveTextContent(/décembre|vendredi/);
  });

  it.each([[null], [undefined]])('sans échéance (%s), aucun délai n’est promis', async (valeur) => {
    mutateAsync.mockResolvedValue({ data: { id: 43, reference_number: 'BK-OLD', total_amount: 60_000, currency: 'XOF', response_deadline: valeur } });
    rendre(bien('daily', 20_000));
    choisirEtContinuer();
    accepterEtEnvoyer();

    const echeance = await screen.findByTestId('booking-success-deadline');
    expect(echeance).toHaveTextContent(fr.bookings.tunnel.success.noDeadline);
    expect(echeance.textContent).not.toMatch(/\d/);
  });

  it.each([
    ['fr', fr],
    ['en', en],
    ['wo', wo],
  ] as const)('%s : aucun libellé de la confirmation ni de la demande ne porte de délai chiffré', (_l, messages) => {
    const { body, deadline, noDeadline, step1, step1Deadline } = messages.bookings.tunnel.success;
    for (const libelle of [body, deadline, noDeadline, step1, step1Deadline, messages.bookings.tunnel.recap.requestNotice]) {
      expect(libelle).not.toMatch(/\d/);
    }
    expect(deadline).toContain('{date}');
  });
});

describe('TCK-2510 — les refus du serveur', () => {
  it('un refus sur property_id s’affiche en erreur globale', async () => {
    const message = 'Ce bien se loue au mois ou à l’année : il relève d’un bail.';
    mutateAsync.mockRejectedValue(new ApiError(422, { message, errors: { property_id: [message] } }));
    rendre(bien('daily', 20_000));
    choisirEtContinuer();
    accepterEtEnvoyer();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Votre demande');
  });

  it('un refus sur end_date ramène au calendrier, message affiché', async () => {
    const message = 'Indiquez des dates couvrant au moins une nuit.';
    mutateAsync.mockRejectedValue(new ApiError(422, { message, errors: { end_date: [message] } }));
    rendre(bien('daily', 20_000));
    choisirEtContinuer();
    accepterEtEnvoyer();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Continuer' })[0]).toBeInTheDocument();
  });

  it('TCK-596 — des nuits confirmées entre-temps : retour au calendrier, départ retiré, nuits relues', async () => {
    mutateAsync.mockRejectedValue(
      new ApiError(422, { code: 'booking.dates_overlap', message: 'Une autre réservation confirmée occupe déjà ces dates sur ce bien.' }),
    );
    rendre(bien('daily', 20_000));
    choisirEtContinuer('2026-12-13', '2026-12-16');
    accepterEtEnvoyer();

    expect(await screen.findByRole('alert')).toHaveTextContent('Une autre réservation confirmée occupe déjà ces dates');
    expect(screen.getAllByRole('button', { name: 'Continuer' })[0]).toBeDisabled();
    expect(jour('2026-12-13')).toHaveAttribute('aria-pressed', 'true');
    expect(jour('2026-12-16')).toHaveAttribute('aria-pressed', 'false');
    expect(nuits.lectures).toContain(1);
  });

  it('des dates rapportées par l’URL devenues prises tombent, et l’écran le dit', () => {
    rendre(bien('daily', 20_000), 'fr', { debut: '2026-12-08', fin: '2026-12-12', personnes: 2 });
    expect(screen.getByRole('alert')).toHaveTextContent('Ces dates ne sont plus libres');
    expect(screen.getAllByRole('button', { name: 'Continuer' })[0]).toBeDisabled();
    expect(jour('2026-12-08')).toHaveAttribute('aria-pressed', 'true');
  });

  it('une arrivée sans dates (celle de la page : `lireSejourDemande` rend des dates nulles) n’annonce rien', () => {
    rendre(bien('daily', 20_000), 'fr', { debut: null, fin: null, personnes: 1 });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/ne sont plus libres/)).toBeNull();
  });
});

describe('TCK-2510 — AC3 : connexion, dates conservées', () => {
  it('drapeau éteint : un anonyme est renvoyé à la connexion avec ses dates et ses personnes', async () => {
    auth.user = null;
    telephone.actif = false;
    rendre(bien('daily', 20_000));
    fireEvent.click(screen.getByRole('button', { name: 'Une personne de plus' }));
    choisirEtContinuer('2026-12-13', '2026-12-16');

    const bouton = await screen.findByRole('button', { name: 'Se connecter pour envoyer' }, { timeout: 3000 }).catch(() => null);
    const cible = bouton ?? screen.getAllByRole('button', { name: 'Se connecter pour envoyer' })[0]!;
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(cible).toBeEnabled());
    fireEvent.click(cible);

    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0]![0] as string, 'https://x.invalid');
    expect(url.pathname).toBe('/auth/login');
    const retour = new URL(url.searchParams.get('redirect')!, 'https://x.invalid');
    expect(retour.pathname).toBe('/fr/bookings');
    expect(Object.fromEntries(retour.searchParams)).toEqual({ property: 'bien-7', debut: '2026-12-13', fin: '2026-12-16', personnes: '2' });
    expect(screen.queryByTestId('booking-identity')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('au retour, le tunnel rouvre la demande sur les dates rapportées', () => {
    rendre(bien('daily', 20_000), 'fr', { debut: '2026-12-13', fin: '2026-12-16', personnes: 2 });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Votre demande');
    expect(screen.getAllByText(/3 nuits · 2 personnes/).length).toBeGreaterThan(0);
    expect(compact(screen.getAllByTestId('booking-total')[0]!.textContent)).toBe(compact('60 000 F CFA'));
  });

  it('drapeau allumé : le numéro, le code, puis la demande part au nom du compte ouvert', async () => {
    auth.user = null;
    telephone.actif = true;
    telephone.demander.mockResolvedValue({ attente: 60, codeApercu: '123456' });
    telephone.verifier.mockResolvedValue({ token: 'tok', user: { id: 9 }, expires_at: null });
    mutateAsync.mockResolvedValue({ data: { id: 44, reference_number: 'BK-TEL', total_amount: 60_000, currency: 'XOF', response_deadline: null } });
    rendre(bien('daily', 20_000));
    choisirEtContinuer();

    const champ = await screen.findByLabelText('Votre numéro');
    fireEvent.change(champ, { target: { value: '771234567' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Recevoir le code' })[0]!);

    await waitFor(() => expect(telephone.demander).toHaveBeenCalledWith('+221771234567', 'fr'));
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser ce code' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmer et envoyer la demande' })[0]!);

    await screen.findByRole('heading', { level: 1, name: 'Demande envoyée' });
    expect(telephone.verifier).toHaveBeenCalledWith({ phone: '+221771234567', code: '123456' }, 'fr');
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('drapeau allumé : UN consentement, qui nomme la confidentialité (TCK-624) et précède l’envoi du code', async () => {
    auth.user = null;
    telephone.actif = true;
    rendre(bien('daily', 20_000));
    choisirEtContinuer();

    fireEvent.change(await screen.findByLabelText('Votre numéro'), { target: { value: '771234567' } });
    expect(screen.queryByText(/En recevant le code/)).toBeNull();
    const consentement = screen.getByRole('checkbox').closest('label')!;
    expect(consentement).toHaveTextContent('politique de confidentialité');
    expect(within(consentement).getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute(
      'href',
      expect.stringContaining('/legal/privacy'),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Recevoir le code' })[0]!);
    expect(screen.getByRole('alert')).toHaveTextContent('Acceptez les conditions');
    expect(telephone.demander).not.toHaveBeenCalled();
  });

  it('drapeau allumé, second facteur exigé : repli sur la connexion, dates conservées', async () => {
    auth.user = null;
    telephone.actif = true;
    telephone.demander.mockResolvedValue({ attente: 60, codeApercu: null });
    telephone.verifier.mockResolvedValue({ requires_2fa: true });
    rendre(bien('daily', 20_000));
    choisirEtContinuer('2026-12-13', '2026-12-16');

    fireEvent.change(await screen.findByLabelText('Votre numéro'), { target: { value: '771234567' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Recevoir le code' })[0]!);
    fireEvent.change(await screen.findByLabelText('Code reçu par SMS'), { target: { value: '654321' } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Confirmer et envoyer la demande' })[0]!);
    });

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(decodeURIComponent(push.mock.calls[0]![0] as string)).toContain('debut=2026-12-13&fin=2026-12-16');
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe('TCK-2510 — ce que le tunnel ne réserve pas (TCK-530)', () => {
  it('monthly : état vide, sans montant ni invitation à se connecter ; Visiter mène à la fiche', () => {
    auth.user = null;
    rendre(bien('monthly', 250_000));
    const etat = screen.getByTestId('booking-long-term');
    expect(within(etat).getByText('Ce bien se loue au mois ou à l\'année')).toBeInTheDocument();
    expect(compact(document.body.textContent)).not.toContain('250000');
    expect(screen.queryByTestId('booking-total')).not.toBeInTheDocument();
    expect(screen.queryByText(/Connectez-vous/)).not.toBeInTheDocument();
    expect(within(etat).getByText('Visiter').closest('a')).toHaveAttribute('href', '/fr/properties/bien-7');
    expect(within(etat).getByText("Contacter l'agent").closest('a')).toHaveAttribute('href', '/fr/agents/awa-agent');
  });

  it('monthly : « Contacter l’agent » suit le CONTACT PRINCIPAL (agent, slug), pas le propriétaire', () => {
    rendre(
      bien('monthly', 250_000, {
        owner: { id: 3, name: 'Moussa', slug: 'moussa-proprio', avatar_url: null, is_agent: false, member_since: null },
        primary_contact: { id: 9, name: 'Awa Seck', slug: 'awa-seck', is_agent: true, has_whatsapp: false, has_phone: true },
      }),
    );
    const etat = screen.getByTestId('booking-long-term');
    expect(within(etat).getByText("Contacter l'agent").closest('a')).toHaveAttribute('href', '/fr/agents/awa-seck');
  });

  it('monthly : un contact principal qui n’est pas agent ne renvoie pas au profil du propriétaire-agent', () => {
    rendre(
      bien('monthly', 250_000, {
        primary_contact: { id: 9, name: 'Fatou', slug: 'fatou-n', is_agent: false, has_whatsapp: false, has_phone: true },
      }),
    );
    expect(within(screen.getByTestId('booking-long-term')).queryByText("Contacter l'agent")).toBeNull();
  });

  it('yearly : même refus ; WhatsApp quand le contact en a un', () => {
    rendre(bien('yearly', 3_000_000, { primary_contact: { id: 4, name: 'Sokhna', has_whatsapp: true, has_phone: true } }));
    expect(screen.getByTestId('booking-long-term')).toBeInTheDocument();
    expect(compact(document.body.textContent)).not.toContain('30000000');
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
  });

  it('vente : pas de dates, l’offre se fait depuis la fiche', () => {
    rendre({ ...bien('monthly', 90_000_000), contract_type: 'sale', rent_period: null } as unknown as PropertyDetail);
    expect(screen.getByText('Ce bien est à vendre')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuer' })).not.toBeInTheDocument();
  });
});
