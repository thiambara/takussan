/**
 * TCK-2590 — la liste des clients : les vues et leurs comptes, la ligne de contact (le téléphone
 * avant l'e-mail, Appeler et WhatsApp enregistrés pour le personnel), sa recherche, la relance en
 * retard, l'étiquette et l'en-tête qui filtrent ou trient par l'URL, et le bailleur sans « Ajouter ».
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: routeur.refresh }),
  useSearchParams: () => nav.params,
  usePathname: () => '/app/customers',
}));
const geste = vi.hoisted(() => ({ mutate: vi.fn(), isError: false }));
const designation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const routeur = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('@/lib/queries/customer-gestures', () => ({ useEnregistrerContactClient: () => geste, useDesignerReferent: () => designation }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({
  PlanifierDialog: ({ customer }: { customer?: { libelle: string } }) => <div role="dialog">planifier {customer?.libelle}</div>,
}));

import { ListeDesClients, type ListeDesClientsProps } from '../ListeDesClients';

const MARIAMA: CustomerListItem = {
  id: 7,
  first_name: 'Mariama',
  last_name: 'Fall',
  email: 'mariama.fall@example.test',
  phone: '+221706482056',
  status: 'active',
  pipeline_stage: 'prospect',
  created_at: '2026-11-03T10:00:00Z',
  seeking_contract_type: 'rent',
  budget_max: '250000.00',
  seeking_property_types: ['studio', 'apartment'],
  seeking_cities: ['Dakar'],
  seeking_neighborhoods: ['Mermoz', 'Ouakam'],
  next_action: { type: 'visit', id: 3, at: '2030-11-12T10:00:00Z', label: 'Studio Mermoz', overdue: false },
  follow_up: null,
  referent: { id: 2, name: 'Khady Diallo' },
  tags: [{ id: 1, name: 'Meublé', slug: 'meuble', color: null }],
};

const YACINE: CustomerListItem = {
  id: 8,
  first_name: 'Yacine',
  last_name: 'Diouf',
  email: null,
  phone: '+221775120833',
  status: 'active',
  pipeline_stage: 'negotiating',
  created_at: '2026-10-03T10:00:00Z',
  seeking_contract_type: 'sale',
  budget_max: '90000000.00',
  seeking_property_types: ['villa'],
  seeking_neighborhoods: ['Almadies'],
  next_action: null,
  follow_up: { reason: 'no_contact', since: '2026-11-03T10:00:00Z', days: 9 },
  referent: null,
  tags: [],
};

/** Pape Moussa Thiaw (maquette a-0) : ni référent, ni action prévue, ni relance due. */
const PAPE: CustomerListItem = {
  id: 9,
  first_name: 'Pape Moussa',
  last_name: 'Thiaw',
  email: null,
  phone: '+221768052790',
  status: 'active',
  pipeline_stage: 'lead',
  created_at: '2026-11-01T10:00:00Z',
  seeking_contract_type: 'sale',
  seeking_property_types: ['house'],
  seeking_cities: ['Thiès'],
  next_action: null,
  follow_up: null,
  referent: null,
  tags: [],
};

function page(data: CustomerListItem[]): PaginatedResponse<CustomerListItem> {
  return { data, meta: { total: data.length, current_page: 1, last_page: 1, per_page: 20 }, links: { first: null, last: null, prev: null, next: null } };
}

const AGENT: ListeDesClientsProps = {
  page: page([MARIAMA, YACINE]),
  vue: 'tous',
  tri: 'next_action_at',
  vues: ['a-relancer', 'mes-clients', 'negociation', 'tous'],
  comptes: { 'a-relancer': 6, 'mes-clients': 38, negociation: 10, tous: 141 },
  personnel: true,
  admin: false,
  crmTags: [],
  filtre: false,
};

function monter(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>));
}

const derniereUrl = () => String(nav.replace.mock.calls.at(-1)?.[0] ?? '');
const table = () => screen.getByRole('table', { name: 'Liste des clients' });
const lignesDuTelephone = () => screen.getByRole('list', { name: 'Liste des clients' });

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  geste.mutate.mockReset();
  geste.isError = false;
  designation.mutate.mockReset();
  routeur.refresh.mockReset();
});

describe('les vues', () => {
  it('pastilles et onglets portent leur compte (AC2) ; le sous-titre dit le total et les relances', () => {
    monter(<ListeDesClients {...AGENT} />);
    const pastilles = screen.getByRole('group', { name: 'Vues des clients' });
    expect(within(pastilles).getByRole('button', { name: /À relancer\s*6/ })).toBeInTheDocument();
    expect(within(pastilles).getByRole('button', { name: /Tous\s*141/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: /Mes clients\s*38/ })).toBeInTheDocument();
    expect(screen.getByText('141 clients · 6 à relancer')).toBeInTheDocument();
  });

  it('choisir « À relancer » pose ?vue=a-relancer, sans tri ni page (le tri de la vue s’applique)', () => {
    nav.params = new URLSearchParams('sort=last_name&page=3&search=fall');
    monter(<ListeDesClients {...AGENT} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Vues des clients' })).getByRole('button', { name: /À relancer/ }));
    const url = derniereUrl();
    expect(url).toContain('vue=a-relancer');
    expect(url).not.toContain('sort=');
    expect(url).not.toContain('page=');
    expect(url).toContain('search=fall');
  });

  it('« Sans référent » au sous-titre de l’admin seulement', () => {
    monter(<ListeDesClients {...AGENT} admin vues={[...AGENT.vues.slice(0, 3), 'sans-referent', 'tous']} comptes={{ ...AGENT.comptes, 'sans-referent': 4 }} />);
    expect(screen.getByText('141 clients · 6 à relancer · 4 sans référent')).toBeInTheDocument();
  });
});

describe('la ligne de contact', () => {
  it('le tableau montre le téléphone formaté, pas l’e-mail, d’une fiche qui a les deux (AC1)', () => {
    monter(<ListeDesClients {...AGENT} />);
    const rangee = within(table()).getByRole('link', { name: 'Mariama Fall' }).closest('tr')!;
    expect(within(rangee).getByText('+221 70 648 20 56')).toBeInTheDocument();
    expect(within(rangee).queryByText('mariama.fall@example.test')).toBeNull();
  });

  it('chaque ligne du téléphone porte Appeler et WhatsApp sur le numéro', () => {
    monter(<ListeDesClients {...AGENT} />);
    const lignes = within(lignesDuTelephone()).getAllByRole('listitem');
    expect(lignes).toHaveLength(2);
    for (const [ligne, nom, numero] of [
      [lignes[0], 'Mariama Fall', '+221706482056'],
      [lignes[1], 'Yacine Diouf', '+221775120833'],
    ] as const) {
      expect(within(ligne).getByRole('link', { name: `Appeler ${nom}` })).toHaveAttribute('href', `tel:${numero}`);
      expect(within(ligne).getByRole('link', { name: `Écrire à ${nom} sur WhatsApp` }).getAttribute('href')).toMatch(new RegExp(`^https://wa\\.me/${numero.slice(1)}\\?text=`));
    }
  });

  it('le geste est enregistré pour le personnel (POST …/contacts), jamais pour le bailleur', () => {
    const { unmount } = monter(<ListeDesClients {...AGENT} />);
    fireEvent.click(within(lignesDuTelephone()).getAllByRole('link', { name: 'Appeler Mariama Fall' })[0]);
    expect(geste.mutate).toHaveBeenCalledWith({ id: 7, channel: 'call' });
    unmount();
    geste.mutate.mockReset();
    monter(<ListeDesClients {...AGENT} personnel={false} vues={[]} comptes={{}} />);
    fireEvent.click(within(lignesDuTelephone()).getAllByRole('link', { name: 'Écrire à Mariama Fall sur WhatsApp' })[0]);
    expect(geste.mutate).not.toHaveBeenCalled();
  });

  it('un geste que l’API n’a pas noté se DIT (P228.06) ; sinon, rien', () => {
    const { unmount } = monter(<ListeDesClients {...AGENT} />);
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();
    geste.isError = true;
    monter(<ListeDesClients {...AGENT} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Le contact n’a pas été noté sur la fiche du client.');
  });

  it('la relance en retard en tête de ligne ; sinon la prochaine action ; et sa recherche', () => {
    monter(<ListeDesClients {...AGENT} />);
    const lignes = within(lignesDuTelephone()).getAllByRole('listitem');
    expect(within(lignes[1]).getByText('Relance en retard · 9 j sans contact')).toHaveClass('line-clamp-2');
    expect(within(lignes[0]).getByText(/^Visite .+ 10:00$/)).toBeInTheDocument();
    expect(within(lignes[0]).getByText(/Studio, appartement · Mermoz, Ouakam · ≤ 250\s000\sF/)).toBeInTheDocument();
    expect(within(lignes[1]).getByText(/Villa · Almadies · achat ≤ 90\s000\s000\sF/)).toBeInTheDocument();
  });
});

describe('le tableau', () => {
  it('Client · Cherche · Étape · Prochaine action · Référent · Étiquettes', () => {
    monter(<ListeDesClients {...AGENT} />);
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual([
      'Client',
      'Cherche',
      'Étape',
      'Prochaine action',
      'Référent',
      'Étiquettes',
    ]);
  });

  it('l’étiquette filtre la liste par l’URL, page 1', () => {
    nav.params = new URLSearchParams('page=2');
    monter(<ListeDesClients {...AGENT} />);
    fireEvent.click(within(table()).getByRole('button', { name: 'Meublé' }));
    expect(derniereUrl()).toContain(`tags=${encodeURIComponent('Meublé')}`);
    expect(derniereUrl()).not.toContain('page=');
  });

  it('l’en-tête Client trie par nom, puis à l’envers ; la colonne triée est annoncée', () => {
    monter(<ListeDesClients {...AGENT} tri="last_name" />);
    const client = within(table()).getByRole('columnheader', { name: /Client/ });
    expect(client).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(within(client).getByRole('button', { name: 'Trier par Client' }));
    expect(derniereUrl()).toContain('sort=-last_name');
  });

  it('« Planifier une visite » ouvre la feuille avec le client posé', () => {
    monter(<ListeDesClients {...AGENT} />);
    fireEvent.click(within(table()).getByRole('button', { name: 'Planifier une visite avec Mariama Fall' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('planifier Mariama Fall');
  });
});

describe('le bailleur et la liste vide', () => {
  it('le personnel : « Étapes » mène au pipeline, « Ajouter un client » ouvre la création', async () => {
    monter(<ListeDesClients {...AGENT} />);
    expect(screen.getByRole('link', { name: 'Étapes' })).toHaveAttribute('href', '/app/crm/pipeline');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un client' }));
    // Chargée à sa première ouverture (TCK-1038, `next/dynamic`) : elle paraît une fois son morceau lu.
    expect(await screen.findByRole('dialog', { name: 'Nouveau client' })).toBeInTheDocument();
  });

  it('le bailleur : ni « Ajouter un client », ni « Étapes », ni vues (AC5)', () => {
    monter(<ListeDesClients {...AGENT} personnel={false} vues={[]} comptes={{}} />);
    const liens = screen.queryAllByRole('link').map((a) => a.getAttribute('href'));
    expect(liens).not.toContain('/app/crm/pipeline');
    expect(screen.queryByRole('button', { name: /Ajouter un client/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Vues des clients' })).toBeNull();
  });

  it('vide, le personnel est invité à ajouter un client ; le bailleur, non', async () => {
    const { unmount } = monter(<ListeDesClients {...AGENT} page={page([])} />);
    expect(screen.getByText('Pas encore de clients')).toBeInTheDocument();
    expect(screen.getByText('Ils arrivent avec vos demandes de contact, ou ajoutez-en un.')).toBeInTheDocument();
    // « Ajouter un client » ouvre la création sur place (TCK-2590), dans l'état vide comme en tête.
    fireEvent.click(screen.getAllByRole('button', { name: /Ajouter un client/ }).at(-1)!);
    // Chargée à sa première ouverture (TCK-1038, `next/dynamic`) : elle paraît une fois son morceau lu.
    expect(await screen.findByRole('dialog', { name: 'Nouveau client' })).toBeInTheDocument();
    unmount();
    monter(<ListeDesClients {...AGENT} page={page([])} personnel={false} vues={[]} comptes={{}} />);
    expect(screen.queryByRole('button', { name: /Ajouter un client/ })).toBeNull();
  });

  it('vide sous une vue ou un filtre : « Aucun client ici », sans invitation à créer', () => {
    monter(<ListeDesClients {...AGENT} page={page([])} vue="a-relancer" filtre />);
    expect(screen.getByText('Aucun client ici')).toBeInTheDocument();
    expect(screen.queryByText('Pas encore de clients')).toBeNull();
  });
});

describe('« Me désigner » (crm.assign)', () => {
  const lignePape = () => within(table()).getByRole('link', { name: 'Pape Moussa Thiaw' }).closest('tr')!;

  it('une fiche sans référent offre « Me désigner » à qui porte crm.assign ; le geste désigne le lecteur', () => {
    designation.mutate.mockImplementation((_v: unknown, rappels: { onSuccess: () => void }) => rappels.onSuccess());
    monter(<ListeDesClients {...AGENT} page={page([MARIAMA, YACINE, PAPE])} designer={{ moi: 42 }} />);
    // Rien de prévu et personne pour le prévoir : la case le dit, comme la maquette.
    expect(within(lignePape()).getByText('Sans référent')).toBeInTheDocument();
    fireEvent.click(within(lignePape()).getByRole('button', { name: 'Me désigner référent de Pape Moussa Thiaw' }));
    expect(designation.mutate).toHaveBeenCalledWith({ id: 9, userId: 42 }, expect.anything());
    expect(routeur.refresh).toHaveBeenCalledTimes(1);
    // Une fiche qui a déjà son référent ne l'offre pas.
    const mariama = within(table()).getByRole('link', { name: 'Mariama Fall' }).closest('tr')!;
    expect(within(mariama).queryByRole('button', { name: /Me désigner/ })).toBeNull();
    expect(within(mariama).getAllByText('Khady Diallo').length).toBeGreaterThan(0);
  });

  it('sans la capacité (ou pour le bailleur), aucune case « Me désigner »', () => {
    monter(<ListeDesClients {...AGENT} page={page([YACINE, PAPE])} designer={null} />);
    expect(within(table()).queryByRole('button', { name: /Me désigner/ })).toBeNull();
    expect(designation.mutate).not.toHaveBeenCalled();
  });

  it('la négociation et la recherche, que la démo n’a pas, se lisent sur les personnes de la maquette', () => {
    monter(<ListeDesClients {...AGENT} />);
    const yacine = within(table()).getByRole('link', { name: 'Yacine Diouf' }).closest('tr')!;
    expect(within(yacine).getByText('Négociation')).toBeInTheDocument();
    expect(yacine).toHaveTextContent(/Villa · Almadies.*achat ≤ 90\s000\s000\sF/);
  });
});
