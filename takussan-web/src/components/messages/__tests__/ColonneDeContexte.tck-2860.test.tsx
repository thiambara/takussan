/**
 * TCK-2860 (AC1, données de TCK-2858) — la fiche du client porte « Projet », « Dernière visite » et
 * « Premier contact » ; « Lié à cette conversation » ouvre la demande de contact liée ; repliée, le rail
 * porte l'icône de la demande ; entre 1024 et 1279 (`superposee`), fermée, rien (pas de rail).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ColonneDeContexte, ligneDuProjet } from '../ColonneDeContexte';

let reponse: unknown;
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversationContext: () => ({ data: reponse, isLoading: false }),
}));

const CLIENT = {
  id: 31,
  full_name: 'Malick Seck',
  stage: 'qualified',
  phone: '+221775124018',
  assigned_agent: null,
  project: { contract_type: 'sale', property_types: ['house'], budget_min: null, budget_max: 70_000_000, cities: ['Thiès'], neighborhoods: [] },
  last_visit: null,
  // Lundi 9 novembre 2026, 10 h à Dakar.
  first_contact_at: '2026-11-09T10:00:00Z',
  origin: 'form',
  contact_lead: { id: 88, created_at: '2026-11-09T10:00:00Z', property_title: 'Maison avec jardin' },
};

function contexte(client: Record<string, unknown> | null) {
  return { data: { property: null, lease: null, maintenance: null, customer: client } };
}

beforeEach(() => {
  reponse = contexte(CLIENT);
});

describe('<ColonneDeContexte> — projet, visite, premier contact, demande (TCK-2860)', () => {
  it('AC1 — « Projet », « Dernière visite : Aucune encore », « Premier contact » avec son origine', () => {
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    const fiche = screen.getByTestId('contexte-client');
    expect(fiche).toHaveTextContent(/Projet\s*Achat · jusqu’à 70\sM\sF/);
    expect(fiche).toHaveTextContent('Dernière visiteAucune encore');
    expect(fiche).toHaveTextContent(/Premier contactlun\. 9 nov\., par l’annonce/);
  });

  it('AC1 — la demande liée : « Demande de contact du 9 nov. », en lien vers la demande', () => {
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    const lie = screen.getByTestId('contexte-lie');
    const lien = within(lie).getByRole('link', { name: /Demande de contact du 9 nov\./ });
    expect(lien).toHaveAttribute('href', '/app/leads?lead=88');
    // La maquette garde la phrase quand il n'y a ni bail ni intervention.
    expect(lie).toHaveTextContent('Ni bail ni intervention pour l’instant.');
  });

  it('une visite passée se date ; une origine nulle laisse la date seule', () => {
    reponse = contexte({ ...CLIENT, last_visit: { id: 4, scheduled_at: '2026-11-08T10:00:00Z', property_title: 'X' }, origin: null });
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    const fiche = screen.getByTestId('contexte-client');
    expect(fiche).toHaveTextContent(/Dernière visitedim\. 8 nov\./);
    expect(fiche).not.toHaveTextContent('Aucune encore');
    expect(fiche).toHaveTextContent(/Premier contactlun\. 9 nov\.$/);
  });

  it('fiche illisible (tout à null) : ni ligne vide, ni « Aucune encore » mensonger, ni demande', () => {
    reponse = contexte({ ...CLIENT, project: null, last_visit: null, first_contact_at: null, origin: null, contact_lead: null });
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    const fiche = screen.getByTestId('contexte-client');
    expect(fiche).not.toHaveTextContent('Projet');
    expect(fiche).not.toHaveTextContent('Dernière visite');
    expect(fiche).not.toHaveTextContent('Premier contact');
    expect(screen.queryByRole('link', { name: /Demande de contact/ })).toBeNull();
  });

  it('une réponse d’avant TCK-2858 (clés absentes) ne rend aucune des lignes neuves', () => {
    reponse = contexte({ id: 31, full_name: 'Malick Seck', stage: null, phone: null, assigned_agent: null });
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    expect(screen.getByTestId('contexte-client')).not.toHaveTextContent(/Projet|Dernière visite|Premier contact/);
  });

  it('repliée : le rail porte l’icône « Demande de contact liée »', () => {
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte={false} onOuvrir={() => {}} />));
    expect(screen.getByRole('img', { name: 'Demande de contact liée' })).toBeInTheDocument();
  });

  it('entre 1024 et 1279 (`superposee`) : fermée, aucun rail ; ouverte, le panneau sans `max-xl:hidden`', () => {
    const { container, rerender } = render(withIntl(<ColonneDeContexte conversationId={7} ouverte={false} onOuvrir={() => {}} superposee />));
    expect(container).toBeEmptyDOMElement();
    rerender(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} superposee />));
    expect(screen.getByTestId('colonne-de-contexte')).not.toHaveClass('max-xl:hidden');
  });
});

describe('ligneDuProjet (TCK-2860)', () => {
  const t = (cle: string, v?: Record<string, string>) =>
    ({ 'contrat.sale': 'Achat', 'contrat.rent': 'Location' })[cle] ??
    (cle === 'jusqua' ? `jusqu’à ${v?.montant}` : cle === 'aPartirDe' ? `dès ${v?.montant}` : cle === 'entre' ? `${v?.min} à ${v?.max}` : cle);
  const abreger = (n: number) => `${n / 1_000_000} M`;
  const vide = { contract_type: null, property_types: [], budget_min: null, budget_max: null, cities: [], neighborhoods: [] };

  it('contrat et budget ; un budget seul ; à défaut les lieux ; rien → null', () => {
    expect(ligneDuProjet({ ...vide, contract_type: 'rent', budget_min: 1_000_000, budget_max: 2_000_000 }, t, abreger)).toBe('Location · 1 M à 2 M');
    expect(ligneDuProjet({ ...vide, budget_min: 5_000_000 }, t, abreger)).toBe('dès 5 M');
    expect(ligneDuProjet({ ...vide, neighborhoods: ['Mermoz'], cities: ['Dakar', 'Thiès'] }, t, abreger)).toBe('Mermoz · Dakar');
    expect(ligneDuProjet({ ...vide, property_types: ['house'] }, t, abreger)).toBeNull();
    expect(ligneDuProjet(null, t, abreger)).toBeNull();
  });
});
