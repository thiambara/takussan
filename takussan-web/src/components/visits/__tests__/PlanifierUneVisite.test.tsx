/**
 * TCK-590 puis TCK-2586 — « Planifier une visite » : le personnel planifie POUR un client ou un
 * prospect (nom + téléphone), à l'heure de Dakar, dans une feuille qui propose les CRÉNEAUX LIBRES du
 * bien (`GET /api/property-visits/slots`) au lieu d'une liste de 20 heures.
 *
 * Le navigateur est à Paris : un vert pris à UTC ne distinguerait pas les deux fuseaux. L'horloge est
 * figée au jeudi 12 novembre 2026, 08:00 Z (08:00 à Dakar, 09:00 à Paris).
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { PlanifierDialog, PlanifierUneVisite } from '../PlanifierUneVisite';

const MAINTENANT = new Date('2026-11-12T08:00:00Z');

const plan = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const creneaux = vi.hoisted(() => ({ appels: [] as Array<[number | null, string | null]>, refetch: vi.fn(), erreur: false }));
const recherches: string[] = [];

/** Le profil ACTIF de l'appelant (passe 2, n4) : c'est lui, et non les rôles globaux, qui décide. */
const actif = vi.hoisted(() => ({ type: 'agent', status: 'active', agency_id: 3 as number | null }));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: {
      data: [
        { id: 'owner:1', type: 'owner', numeric_id: 1, agency_id: 3, status: 'active', created_at: null },
        { id: 'actif:9', numeric_id: 9, created_at: null, ...actif },
      ],
      meta: { active_profile_id: 'actif:9', count: 2 },
    },
  }),
}));

/**
 * Les créneaux que le serveur rend pour un bien et un jour : 08:00 (dans le délai de prévenance de
 * 30 min à 08:00 Z, le serveur le dit indisponible), 09:00 PRIS, 09:30, 10:00 et 15:30 libres.
 */
vi.mock('@/lib/queries/visits', () => ({
  usePlanVisit: () => plan,
  useCreneauxDeVisite: (bien: number | null, jour: string | null) => {
    creneaux.appels.push([bien, jour]);
    if (bien === null || jour === null) return { isPending: true, isSuccess: false, isError: false, data: undefined, refetch: creneaux.refetch };
    if (creneaux.erreur) return { isPending: false, isSuccess: false, isError: true, data: undefined, refetch: creneaux.refetch };
    const slots = [
      { label: '08:00', available: false },
      { label: '09:00', available: false },
      { label: '09:30', available: true },
      { label: '10:00', available: true },
      { label: '15:30', available: true },
    ].map((c) => ({ ...c, start: `${jour}T${c.label}:00Z` }));
    return { isPending: false, isSuccess: true, isError: false, data: { data: { date: jour, timezone: 'Africa/Dakar', slots } }, refetch: creneaux.refetch };
  },
}));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (_key: unknown, chemin: string, options: { params: { filter: Record<string, string> } }) => {
    recherches.push(`${chemin}:${options.params.filter.search ?? ''}`);
    return chemin === '/api/properties'
      ? { isPending: false, isError: false, isFetching: false, data: { data: [{ id: 10, title: 'Villa à Almadies', reference_number: 'TK-10' }] } }
      : { isPending: false, isError: false, isFetching: false, data: { data: [{ id: 45, first_name: 'Awa', last_name: 'Diop' }] } };
  },
}));

async function ouvrir(ui: React.ReactElement) {
  const user = userEvent.setup();
  render(withIntl(ui));
  await user.click(screen.getByRole('button', { name: 'Planifier une visite' }));
  await screen.findByRole('dialog');
  return user;
}

function pastille(nom: string | RegExp) {
  return screen.getByRole('button', { name: nom });
}

async function prospect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /Visiteur sans fiche/ }));
  await user.type(screen.getByLabelText('Nom du prospect'), 'Moussa Fall');
  await user.type(screen.getByLabelText('Téléphone'), '771234567');
}

describe('<PlanifierUneVisite> — TCK-590 / TCK-2586', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    recherches.length = 0;
    creneaux.appels.length = 0;
    creneaux.erreur = false;
    plan.mutateAsync.mockResolvedValue({ data: { id: 5, customer_id: null }, sms_sent: true, sms_code: null });
    Object.assign(actif, { type: 'agent', status: 'active', agency_id: 3 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('un bailleur n’a pas le bouton : l’API ne le laisse pas planifier pour un tiers', () => {
    Object.assign(actif, { type: 'owner' });
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('passe 2 (n4) — un agent SUSPENDU n’a pas le bouton : l’API le traite en non-personnel', () => {
    Object.assign(actif, { status: 'suspended' });
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={3} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('passe 2 (n4) — le profil actif d’une AUTRE agence que celle du bien n’a pas le bouton', () => {
    Object.assign(actif, { agency_id: 4 });
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={3} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('passe 2 (n4) — un bien sans agence n’a aucun personnel : pas de bouton', () => {
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={null} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('passe 2 (n4) — l’admin actif de l’agence du bien a le bouton', () => {
    Object.assign(actif, { type: 'agency_admin' });
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={3} />));
    expect(screen.getByRole('button', { name: 'Planifier une visite' })).toBeInTheDocument();
  });

  it('depuis la fiche bien, pour un prospect : le créneau de 10:00 part à son instant exact, et le bouton redit le choix', async () => {
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);

    await user.click(pastille('Aujourd’hui'));
    expect(creneaux.appels).toContainEqual([10, '2026-11-12']);
    await user.click(pastille('10:00'));
    expect(pastille('10:00')).toHaveAttribute('aria-pressed', 'true');
    await prospect(user);
    await user.click(screen.getByRole('button', { name: 'Confirmer la visite · jeu. 12 nov. 10:00' }));

    await waitFor(() =>
      expect(plan.mutateAsync).toHaveBeenCalledWith({
        property_id: 10,
        scheduled_at: '2026-11-12T10:00:00Z',
        type: 'in_person',
        visitor_name: 'Moussa Fall',
        visitor_phone: '+221771234567',
      }),
    );
    // AC4 — l'écran de succès, et le lien vers la visite créée.
    expect(await screen.findByText('Visite confirmée')).toBeInTheDocument();
    expect(screen.getByText(/Un SMS a prévenu Moussa\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir la visite' })).toHaveAttribute('href', '/app/visits/5');
    expect(screen.getByRole('link', { name: /Envoyer aussi sur WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/221771234567'),
    );
  });

  it('AC2 — un créneau pris est barré et ne se choisit pas ; une heure passée n’est pas proposée ; « Autre heure… » pose 10:15', async () => {
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);
    await user.click(pastille('Aujourd’hui'));

    // 08:00 part dans moins de trente minutes : pas de pastille.
    expect(screen.queryByRole('button', { name: /^08:00/ })).not.toBeInTheDocument();
    const pris = pastille('09:00, pris');
    expect(pris).toHaveAttribute('aria-disabled', 'true');
    expect(pris).not.toHaveAttribute('aria-pressed');
    await user.click(pris);
    expect(screen.getByRole('button', { name: 'Confirmer la visite' })).toBeInTheDocument();
    expect(screen.getByText('Barrés : vous avez déjà une visite, ou le bien est occupé.')).toBeInTheDocument();

    await user.click(pastille('Autre heure…'));
    // TCK-2586 (m2) — le champ qui apparaît reçoit le focus : la saisie suit le geste.
    expect(screen.getByLabelText(/^Heure/)).toHaveFocus();
    fireEvent.change(screen.getByLabelText(/^Heure/), { target: { value: '10:15' } });
    await prospect(user);
    await user.click(screen.getByRole('button', { name: 'Confirmer la visite · jeu. 12 nov. 10:15' }));

    await waitFor(() =>
      expect(plan.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ scheduled_at: '2026-11-12T10:15:00Z' })),
    );
  });

  it('changer de jour efface l’heure choisie : un autre jour, d’autres créneaux', async () => {
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);
    await user.click(pastille('Aujourd’hui'));
    await user.click(pastille('10:00'));
    await user.click(pastille('Demain'));

    expect(pastille('10:00')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Confirmer la visite' })).toBeInTheDocument();
  });

  it('passe 3 (R1) — la visite est planifiée mais le SMS retenu : l’écran de succès le dit', async () => {
    plan.mutateAsync.mockResolvedValueOnce({ data: { id: 5 }, sms_sent: false, sms_code: 'visit_sms_capped' });
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);

    await user.click(pastille('Aujourd’hui'));
    await user.click(pastille('10:00'));
    await prospect(user);
    await user.click(screen.getByRole('button', { name: /^Confirmer la visite/ }));

    expect(await screen.findByText('Le SMS au visiteur n’est pas parti.')).toBeInTheDocument();
    expect(screen.queryByText(/Un SMS a prévenu/)).not.toBeInTheDocument();
  });

  it('depuis la fiche client : le client est posé, on cherche le bien, le type et la note partent', async () => {
    const user = await ouvrir(<PlanifierUneVisite customer={{ id: 45, libelle: 'Awa Diop', telephone: '+221770000000', etape: 'prospect' }} />);

    expect(screen.getByText('+221770000000 · Prospect')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom du prospect')).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un bien' }), 'Villa');
    await waitFor(() => expect(recherches).toContain('/api/properties:Villa'));
    await user.click(screen.getByRole('button', { name: /Villa à Almadies/ }));
    expect(screen.getByRole('button', { name: /Villa à Almadies/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(pastille('Aujourd’hui'));
    await user.click(pastille('15:30'));
    await user.click(pastille('Virtuelle'));
    await user.type(screen.getByLabelText(/^Note/), 'Portail bleu');
    await user.click(screen.getByRole('button', { name: /^Confirmer la visite/ }));

    await waitFor(() =>
      expect(plan.mutateAsync).toHaveBeenCalledWith({
        property_id: 10,
        scheduled_at: '2026-11-12T15:30:00Z',
        type: 'virtual',
        notes: 'Portail bleu',
        customer_id: 45,
      }),
    );
  });

  it('incomplet : chaque manque est dit à sa section, et rien ne part', async () => {
    const user = await ouvrir(<PlanifierUneVisite />);
    await user.click(screen.getByRole('button', { name: 'Confirmer la visite' }));

    const alertes = (await screen.findAllByRole('alert')).map((a) => a.textContent);
    expect(alertes).toEqual(
      expect.arrayContaining(['Choisissez un bien.', 'Choisissez un jour.', 'Choisissez une heure.', expect.stringMatching(/^Choisissez un client/)]),
    );
    expect(plan.mutateAsync).not.toHaveBeenCalled();
  });

  it('trois états de « Quelle heure ? » : en attente sans jour, erreur avec relecture', async () => {
    creneaux.erreur = true;
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);
    expect(screen.getByText(/Choisissez un bien et un jour/)).toBeInTheDocument();

    await user.click(pastille('Aujourd’hui'));
    expect(screen.getByText('Les créneaux n’ont pas pu être lus.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(creneaux.refetch).toHaveBeenCalled();
  });

  it('le créneau vient d’être pris (422 `visit.slot_overlap`) : l’erreur va sous l’heure et les créneaux sont relus', async () => {
    plan.mutateAsync.mockRejectedValueOnce(
      new ApiError(422, { code: 'visit.slot_overlap', message: 'Ce créneau est déjà réservé.' }),
    );
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);
    await user.click(pastille('Aujourd’hui'));
    await user.click(pastille('10:00'));
    await prospect(user);
    await user.click(screen.getByRole('button', { name: /^Confirmer la visite/ }));

    const groupe = screen.getByRole('group', { name: 'Quelle heure ?' });
    expect(await within(groupe).findByRole('alert')).toBeInTheDocument();
    expect(creneaux.refetch).toHaveBeenCalled();
  });

  it('un autre 422 sans champ (`lead.not_convertible`) va au bas de la feuille, sans relire les créneaux', async () => {
    plan.mutateAsync.mockRejectedValueOnce(new ApiError(422, { code: 'lead.not_convertible', message: 'Demande non convertible.' }));
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);
    await user.click(pastille('Aujourd’hui'));
    await user.click(pastille('10:00'));
    await prospect(user);
    await user.click(screen.getByRole('button', { name: /^Confirmer la visite/ }));

    await waitFor(() => expect(plan.mutateAsync).toHaveBeenCalled());
    const groupe = screen.getByRole('group', { name: 'Quelle heure ?' });
    expect(within(groupe).queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(creneaux.refetch).not.toHaveBeenCalled();
  });
});

describe('<PlanifierDialog> — depuis l’agenda et depuis une demande (TCK-2586)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    creneaux.erreur = false;
    plan.mutateAsync.mockResolvedValue({ data: { id: 8, customer_id: 91 }, sms_sent: true, sms_code: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC1 — le créneau touché dans l’agenda pré-remplit le jour et l’heure', async () => {
    const user = userEvent.setup();
    render(withIntl(<PlanifierDialog property={{ id: 10, libelle: 'Villa à Almadies' }} customer={{ id: 45, libelle: 'Awa Diop' }} jour="2026-11-13" heure="09:30" onClose={vi.fn()} />));

    expect(pastille('Demain')).toHaveAttribute('aria-pressed', 'true');
    expect(pastille('09:30')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Confirmer la visite · ven. 13 nov. 09:30' }));

    await waitFor(() =>
      expect(plan.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ scheduled_at: '2026-11-13T09:30:00Z', customer_id: 45 })),
    );
  });

  it('AC1 — depuis une demande : le demandeur est repris, verrouillé, et la fiche naît de la demande', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <PlanifierDialog
          property={{ id: 10, libelle: 'Villa à Almadies' }}
          demande={{ id: 77, nom: 'Mouhamed Ndiaye', telephone: '+221771112233' }}
          jour="2026-11-12"
          onClose={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole('heading', { name: 'Visite avec Mouhamed' })).toBeInTheDocument();
    expect(screen.getByText('Depuis sa demande · tout est repris')).toBeInTheDocument();
    // TCK-2584 (`app-fil-commercial` a-1) — le numéro se lit groupé.
    expect(screen.getByText('+221 77 111 22 33 · repris de sa demande')).toBeInTheDocument();
    expect(screen.getByLabelText('Repris de sa demande, non modifiable')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom du prospect')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Créer la fiche client/ })).toBeChecked();
    await user.click(pastille('10:00'));
    await user.click(screen.getByRole('button', { name: /^Confirmer la visite/ }));

    await waitFor(() =>
      expect(plan.mutateAsync).toHaveBeenCalledWith({
        property_id: 10,
        scheduled_at: '2026-11-12T10:00:00Z',
        type: 'in_person',
        contact_lead_id: 77,
        create_customer: true,
      }),
    );
    expect(await screen.findByText('Fiche client créée : le message y est épinglé')).toBeInTheDocument();
    expect(screen.getByText('Demande passée en « Traitées »')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir la fiche' })).toHaveAttribute('href', '/app/customers/91');
    expect(screen.getByRole('link', { name: 'Voir la visite' })).toHaveAttribute('href', '/app/visits/8');
  });

  it('depuis une demande, sans créer la fiche : le demandeur part en nom + téléphone', async () => {
    const user = userEvent.setup();
    render(withIntl(<PlanifierDialog property={{ id: 10, libelle: 'Villa à Almadies' }} demande={{ id: 77, nom: 'Mouhamed Ndiaye', telephone: '+221771112233' }} jour="2026-11-12" onClose={vi.fn()} />));
    await user.click(screen.getByRole('checkbox', { name: /Créer la fiche client/ }));
    await user.click(pastille('10:00'));
    await user.click(screen.getByRole('button', { name: /^Confirmer la visite/ }));

    await waitFor(() =>
      expect(plan.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ contact_lead_id: 77, visitor_name: 'Mouhamed Ndiaye', visitor_phone: '+221771112233' }),
      ),
    );
    expect(plan.mutateAsync.mock.calls[0][0]).not.toHaveProperty('create_customer');
  });

  it('TCK-1343 — la fiche existe déjà (409 `customer.duplicate`) : « Utiliser cette fiche » la rattache', async () => {
    plan.mutateAsync.mockRejectedValueOnce(
      new ApiError(409, { code: 'customer.duplicate', existing: [{ id: 12, name: 'Mouhamed Ndiaye', matched_on: 'phone' }] }),
    );
    const user = userEvent.setup();
    render(withIntl(<PlanifierDialog property={{ id: 10, libelle: 'Villa à Almadies' }} demande={{ id: 77, nom: 'Mouhamed Ndiaye', telephone: '+221771112233' }} jour="2026-11-12" onClose={vi.fn()} />));
    await user.click(pastille('10:00'));
    await user.click(screen.getByRole('button', { name: /^Confirmer la visite/ }));

    await user.click(await screen.findByRole('button', { name: 'Utiliser cette fiche' }));
    await waitFor(() => expect(plan.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ contact_lead_id: 77, customer_id: 12 })));
    expect(plan.mutateAsync.mock.calls[1][0]).not.toHaveProperty('create_customer');
  });
});
