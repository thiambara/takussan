/**
 * TCK-2881 — « Proposer une visite » depuis une demande (`app-fil-commercial` a-1/a-2) : le jour que le
 * demandeur a écrit déjà choisi, « Critères déduits du bien », puis « Visite confirmée » avec les
 * critères repris, le SMS remis (TCK-2871) et « Demande suivante → ».
 *
 * Le navigateur est à Paris ; l'horloge est figée au mardi 3 novembre 2026, 09:20 Z (09:20 à Dakar).
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { PlanifierDialog } from '../PlanifierUneVisite';

const MARDI = new Date('2026-11-03T09:20:00Z');

const plan = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const creneaux = vi.hoisted(() => ({ jours: [] as (string | null)[] }));

vi.mock('@/lib/queries/visits', () => ({
  usePlanVisit: () => plan,
  useCreneauxDeVisite: (bien: number | null, jour: string | null) => {
    creneaux.jours.push(jour);
    if (bien === null || jour === null) return { isPending: true, isSuccess: false, isError: false, data: undefined, refetch: vi.fn() };
    const slots = ['10:00', '10:30'].map((label) => ({ label, available: true, start: `${jour}T${label}:00Z` }));
    return { isPending: false, isSuccess: true, isError: false, data: { data: { date: jour, timezone: 'Africa/Dakar', slots } }, refetch: vi.fn() };
  },
}));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: () => ({ isPending: false, isError: false, isFetching: false, data: { data: [] } }),
}));

const BIEN = { id: 10, libelle: 'Pièce indépendante à Ouakam' };
const DEMANDE = { id: 77, nom: 'Mouhamed Ndiaye', prenom: 'Mouhamed', telephone: '+221771112233' };
const CRITERES = { type: 'room', quartier: 'Ouakam', budgetMax: 120_000 };
const SMS = {
  queued_at: '2026-11-03T09:21:00Z',
  body: 'Dakar Immo : votre visite de la pièce indépendante à Ouakam est confirmée samedi 7 nov. à 10:00 avec Sokhna Sène.',
};

function pastille(nom: string | RegExp) {
  return screen.getByRole('button', { name: nom });
}

async function confirmer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(pastille('10:00'));
  await user.click(screen.getByRole('button', { name: /^Confirmer la visite/ }));
  await screen.findByText('Visite confirmée');
}

describe('<PlanifierDialog> depuis une demande — TCK-2881', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MARDI);
    creneaux.jours.length = 0;
    plan.mutateAsync.mockResolvedValue({ data: { id: 8, customer_id: 91 }, sms_sent: true, notification: { channels: ['sms'], sms: SMS } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC1 — « samedi » écrit, planifiée un mardi : le samedi suivant est choisi, en pastille, et la ligne le dit', async () => {
    render(withIntl(<PlanifierDialog property={BIEN} demande={{ ...DEMANDE, message: 'Une visite samedi est-elle possible ?' }} onClose={vi.fn()} />));

    expect(pastille('Sam. 7 nov.')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Mouhamed a écrit « samedi » : le jour est déjà choisi.')).toBeInTheDocument();
    // Les créneaux lus sont ceux du samedi.
    expect(creneaux.jours).toContain('2026-11-07');
    const user = userEvent.setup();
    await user.click(pastille('10:00'));
    await user.click(screen.getByRole('button', { name: 'Confirmer la visite · sam. 7 nov. 10:00' }));
    await waitFor(() => expect(plan.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ scheduled_at: '2026-11-07T10:00:00Z' })));
  });

  it('AC1 — choisir un autre jour retire la ligne : elle ne dit plus vrai', async () => {
    render(withIntl(<PlanifierDialog property={BIEN} demande={{ ...DEMANDE, message: 'Samedi ?' }} onClose={vi.fn()} />));
    await userEvent.setup().click(pastille('Demain'));
    expect(screen.queryByText(/le jour est déjà choisi/)).not.toBeInTheDocument();
  });

  it('AC2 — un message sans jour : ni présélection ni ligne', () => {
    render(withIntl(<PlanifierDialog property={BIEN} demande={{ ...DEMANDE, message: 'Le bien est-il toujours disponible ?' }} onClose={vi.fn()} />));
    expect(screen.queryAllByRole('button', { pressed: true })).toEqual([]);
    expect(pastille('Aujourd’hui')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/le jour est déjà choisi/)).not.toBeInTheDocument();
  });

  it('« Critères déduits du bien » sous « Créer la fiche client… » ; sans critère, la phrase d’avant', () => {
    const { unmount } = render(withIntl(<PlanifierDialog property={BIEN} demande={{ ...DEMANDE, criteres: CRITERES }} onClose={vi.fn()} />));
    expect(screen.getByText('Critères déduits du bien : Chambre · Ouakam · ≤ 120 000 F')).toBeInTheDocument();
    unmount();
    render(withIntl(<PlanifierDialog property={BIEN} demande={DEMANDE} onClose={vi.fn()} />));
    expect(screen.getByText('Le bien de la demande devient son bien d’intérêt.')).toBeInTheDocument();
  });

  it('e2 — la fiche née de la demande : « Bien d’intérêt et critères repris (…) » ; rattachée à une fiche existante, non', async () => {
    const user = userEvent.setup();
    const { unmount } = render(withIntl(<PlanifierDialog property={BIEN} demande={{ ...DEMANDE, criteres: CRITERES }} jour="2026-11-03" onClose={vi.fn()} />));
    await confirmer(user);
    expect(screen.getByText('Bien d’intérêt et critères repris (Chambre · Ouakam · ≤ 120 000 F)')).toBeInTheDocument();
    unmount();

    render(withIntl(<PlanifierDialog property={BIEN} demande={{ ...DEMANDE, ficheId: 35, criteres: CRITERES }} jour="2026-11-03" onClose={vi.fn()} />));
    await confirmer(user);
    expect(screen.queryByText(/critères repris/)).not.toBeInTheDocument();
  });

  it('AC3 — « SMS envoyé à 09:21 » (heure de Dakar) et le texte rendu par l’API ; sans SMS remis, aucun bloc', async () => {
    const user = userEvent.setup();
    const { unmount } = render(withIntl(<PlanifierDialog property={BIEN} demande={DEMANDE} jour="2026-11-03" onClose={vi.fn()} />));
    await confirmer(user);
    expect(screen.getByText('SMS envoyé à 09:21')).toBeInTheDocument();
    expect(screen.getByText(SMS.body)).toBeInTheDocument();
    unmount();

    plan.mutateAsync.mockResolvedValue({ data: { id: 8, customer_id: 91 }, sms_sent: true, notification: { channels: ['whatsapp'], sms: null } });
    render(withIntl(<PlanifierDialog property={BIEN} demande={DEMANDE} jour="2026-11-03" onClose={vi.fn()} />));
    await confirmer(user);
    expect(screen.queryByText(/SMS envoyé/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="sms-envoye"]')).toBeNull();
  });

  it('AC4 — « Demande suivante » ferme la feuille puis ouvre la suivante ; sans suivante, pas de bouton', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDemandeSuivante = vi.fn();
    const { unmount } = render(
      withIntl(<PlanifierDialog property={BIEN} demande={DEMANDE} jour="2026-11-03" onClose={onClose} onDemandeSuivante={onDemandeSuivante} />),
    );
    await confirmer(user);
    expect(screen.getByRole('link', { name: 'Voir la fiche' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir la visite' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Demande suivante' }));
    expect(onClose).toHaveBeenCalled();
    expect(onDemandeSuivante).toHaveBeenCalledTimes(1);
    unmount();

    render(withIntl(<PlanifierDialog property={BIEN} demande={DEMANDE} jour="2026-11-03" onClose={vi.fn()} />));
    await confirmer(user);
    expect(screen.queryByRole('button', { name: 'Demande suivante' })).not.toBeInTheDocument();
  });
});
