import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { afficheA } from '@/test/affiche-a';
import { withIntl } from '@/test/intl';
import type { AgentFirstLeadEntry } from '@/lib/agent-onboarding';

const getOwnerPropertiesAction = vi.fn();
vi.mock('@/app/actions/owner-onboarding', () => ({
  getOwnerPropertiesAction: (...args: unknown[]) => getOwnerPropertiesAction(...args),
}));

const getAgentFirstLeadAction = vi.fn();
vi.mock('@/app/actions/agent-onboarding', () => ({
  agentUpdateSpecializationAction: vi.fn(),
  getAgentFirstLeadAction: (...args: unknown[]) => getAgentFirstLeadAction(...args),
}));

const useAgentRoleCapabilities = vi.fn();
vi.mock('@/hooks/useCan', () => ({
  useAgentRoleCapabilities: (...args: unknown[]) => useAgentRoleCapabilities(...args),
}));

vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));

import { BiensDuBailleur } from '../BiensDuBailleur';
import { EtapeDuNumero } from '../EtapeDuNumero';
import { ProspectDeLAgent } from '../ProspectDeLAgent';

/**
 * TCK-2945 — les assistants d'entrée (maquette `app-entree-assistants`, approche a) :
 *  - e0 et e4 : de 1024 à 1279, le volet de droite passe SOUS la colonne au lieu de disparaître (ADR-0106 § 4) ;
 *  - e1 : la carte du premier prospect porte besoin, budget, dernier contact, origine et note (TCK-2942), chacun
 *    seulement quand l'API le rend ;
 *  - e1 : le bloc des droits liste les accordés (✓) puis les refusés (✗) de `denied`.
 */

const BIEN = {
  id: 5,
  title: 'Appartement F4',
  status: 'rented',
  contract_type: 'rent',
  price: '350000.00',
  rent_period: 'monthly',
  main_photo_url: null,
  location: { quarter: 'Mermoz', city: 'Dakar' },
};

describe('AC1 — assistant du bailleur : le volet sous les biens de 1024 à 1279', () => {
  beforeEach(() => {
    getOwnerPropertiesAction.mockReset();
    getOwnerPropertiesAction.mockResolvedValue({ ok: true, data: { data: [BIEN], meta: { total: 1 } } });
  });

  it('« À faire pour être payé » et « Votre interlocuteur » rendus à 1024 et 1279, sous le tableau ; à droite dès 1280 ; absents au téléphone', async () => {
    render(
      withIntl(
        <BiensDuBailleur
          ownerProfileId={7}
          agence="Dakar Immo"
          telephone="+221770000000"
          pieces={[{ code: 'rib', required: true, kind: 'file', state: 'missing' } as never]}
          interlocuteur={{ source: 'inviter', first_name: 'Awa', last_name: 'Diop', role: 'agent', phone: '+221771230001', whatsapp: true }}
          onAller={vi.fn()}
          enCours={false}
        />,
      ),
    );
    await screen.findAllByTestId('owner-property-5');
    const aFaire = screen.getByTestId('a-faire-pour-etre-paye');
    const carte = screen.getByTestId('interlocuteur');
    for (const largeur of [1024, 1279, 1440]) {
      expect(afficheA(aFaire, largeur)).toBe(true);
      expect(afficheA(carte, largeur)).toBe(true);
    }
    expect(afficheA(aFaire, 390)).toBe(false);
    // Une colonne sous xl : le volet vient APRÈS le tableau des biens dans le flux.
    const tableau = screen.getAllByRole('button', { name: /Appartement F4/ }).at(-1)!;
    expect(tableau.compareDocumentPosition(aFaire) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const grille = screen.getByTestId('volet-du-bailleur').parentElement!;
    expect(grille.className).toMatch(/(^|\s)grid-cols-1(\s|$)/);
    expect(grille.className).toMatch(/(^|\s)xl:grid-cols-\[/);
  });
});

describe('AC2 — étape du numéro : « {agence} vous attend » sous le formulaire de 1024 à 1279', () => {
  it('le panneau est rendu à 1024 et 1279, après le bouton ; la colonne tient 480 px', () => {
    render(
      withIntl(
        <EtapeDuNumero numero="+221776124567" onNumero={vi.fn()} agence="Dakar Immo" onVerifie={vi.fn()} panneau={<p>Dakar Immo vous attend</p>} />,
      ),
    );
    const panneau = screen.getByText('Dakar Immo vous attend');
    expect(afficheA(panneau, 390)).toBe(false);
    expect(afficheA(panneau, 1024)).toBe(true);
    expect(afficheA(panneau, 1279)).toBe(true);
    expect(afficheA(panneau, 1440)).toBe(true);
    const bouton = screen.getByRole('button', { name: /Recevoir le code/ });
    expect(bouton.compareDocumentPosition(panneau) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const conteneur = screen.getByRole('heading', { level: 1 }).parentElement!.parentElement!;
    expect(conteneur.className).toMatch(/(^|\s)lg:max-w-\[30rem\](\s|$)/);
  });
});

const PROSPECT_COMPLET: AgentFirstLeadEntry = {
  id: 42,
  first_name: 'Mamadou',
  last_name: 'Sarr',
  full_name: 'Mamadou Sarr',
  email: null,
  phone: '+221775302148',
  pipeline_stage: 'prospect',
  need: { contract_type: 'rent', property_types: ['apartment'], cities: ['Dakar'], neighborhoods: ['Sacré-Cœur'], min_bedrooms: 3 },
  budget_min: null,
  budget_max: '300000.00',
  last_contacted_at: '2026-11-14T17:40:00Z',
  last_contact_channel: 'phone',
  origin: {
    kind: 'contact_lead',
    channel: 'whatsapp',
    received_at: '2026-11-13T10:00:00Z',
    property_id: 9,
    property_title: 'Mermoz',
    property_reference: 'TK-48213',
  },
  agency_note: { body: 'Préfère visiter le samedi matin.', author_name: 'Awa Diop', created_at: '2026-11-14T18:00:00Z' },
};

const PROSPECT_NU: AgentFirstLeadEntry = {
  ...PROSPECT_COMPLET,
  need: null,
  budget_min: null,
  budget_max: null,
  last_contacted_at: null,
  last_contact_channel: null,
  origin: null,
  agency_note: null,
};

function rendreLAgent() {
  return render(
    withIntl(
      <ProspectDeLAgent
        agentProfileId={11}
        agence="Dakar Immo"
        prenom="Fatou"
        telephone="+221770000000"
        zones={{ specialisation: 'residential', zones: [] }}
        onZones={vi.fn()}
        pieces={[]}
        onAller={vi.fn()}
        enCours={false}
      />,
    ),
  );
}

describe('AC3 — la carte du premier prospect', () => {
  beforeEach(() => {
    getAgentFirstLeadAction.mockReset();
    useAgentRoleCapabilities.mockReturnValue({ data: { data: { agency_id: 3, capabilities: [] } }, isLoading: false, isError: false });
  });

  it('besoin, budget, dernier contact, origine et note : les cinq, à toutes les largeurs', async () => {
    getAgentFirstLeadAction.mockResolvedValue({ ok: true, data: { customer: PROSPECT_COMPLET } });
    rendreLAgent();
    const carte = await screen.findByTestId('agent-first-lead-42');
    const details = within(carte).getByTestId('details-du-prospect');
    expect(details).toHaveTextContent('Cherche appartement, 3 chambres min. en location à Sacré-Cœur');
    expect(details.textContent).toMatch(/Budget\s*jusqu’à 300\s000\sF\/mois/u);
    expect(details.textContent).toMatch(/Dernier contact\s*14 nov\., 17:40/u);
    expect(details).toHaveTextContent('Venu parAnnonce TK-48213 · Mermoz');
    expect(within(carte).getByTestId('note-de-l-agence')).toHaveTextContent('« Préfère visiter le samedi matin. » — Awa Diop');
    // Aucune ligne n'est réservée à une largeur : téléphone et bureau lisent les mêmes cinq.
    for (const largeur of [390, 1024, 1440]) expect(afficheA(details, largeur)).toBe(true);
  });

  it('avec des null : aucune des lignes correspondantes', async () => {
    getAgentFirstLeadAction.mockResolvedValue({ ok: true, data: { customer: PROSPECT_NU } });
    rendreLAgent();
    const carte = await screen.findByTestId('agent-first-lead-42');
    expect(carte).toHaveTextContent('Mamadou Sarr');
    expect(within(carte).queryByTestId('details-du-prospect')).toBeNull();
    expect(carte.textContent).not.toMatch(/Cherche|Budget|Dernier contact|Venu par|«/);
  });

  it('champ par champ : un null retire sa seule ligne', async () => {
    getAgentFirstLeadAction.mockResolvedValue({
      ok: true,
      data: { customer: { ...PROSPECT_COMPLET, budget_max: null, agency_note: { ...PROSPECT_COMPLET.agency_note!, author_name: null }, origin: null } },
    });
    rendreLAgent();
    const carte = await screen.findByTestId('agent-first-lead-42');
    expect(carte).toHaveTextContent('Cherche appartement');
    expect(carte).toHaveTextContent('Dernier contact');
    expect(carte.textContent).not.toMatch(/Budget|Venu par|—/);
    expect(within(carte).getByTestId('note-de-l-agence')).toHaveTextContent('« Préfère visiter le samedi matin. »');
  });
});

describe('AC4 — les droits accordés (✓) puis refusés (✗) de `denied`', () => {
  beforeEach(() => {
    getAgentFirstLeadAction.mockReset();
    getAgentFirstLeadAction.mockResolvedValue({ ok: true, data: { customer: null } });
  });

  it('les accordés d’abord, puis les refusés lus de `denied`', async () => {
    useAgentRoleCapabilities.mockReturnValue({
      data: { data: { agency_id: 3, capabilities: ['properties.create'], granted: ['properties.create'], denied: ['crm.view_all'] } },
      isLoading: false,
      isError: false,
    });
    rendreLAgent();
    const bloc = await screen.findByTestId('agent-capabilities');
    const bouton = within(bloc).getByRole('button');
    if (bouton.getAttribute('aria-expanded') === 'false') fireEvent.click(bouton);
    const accordes = bloc.querySelectorAll('[data-droit="accorde"]');
    const refuses = bloc.querySelectorAll('[data-droit="refuse"]');
    expect([...accordes].map((li) => li.textContent)).toEqual(['Créer un bien']);
    expect([...refuses].map((li) => li.textContent)).toEqual(["Voir tous les contacts de l'agence"]);
    expect(accordes[0]!.compareDocumentPosition(refuses[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(bloc).getByRole('heading', { name: 'Pas dans votre rôle' })).toBeInTheDocument();
  });

  it('sans `denied`, aucun refus inventé', async () => {
    useAgentRoleCapabilities.mockReturnValue({
      data: { data: { agency_id: 3, capabilities: ['properties.create'] } },
      isLoading: false,
      isError: false,
    });
    rendreLAgent();
    const bloc = await screen.findByTestId('agent-capabilities');
    expect(bloc.querySelectorAll('[data-droit="refuse"]')).toHaveLength(0);
    expect(within(bloc).queryByTestId('droits-refuses')).toBeNull();
  });
});
