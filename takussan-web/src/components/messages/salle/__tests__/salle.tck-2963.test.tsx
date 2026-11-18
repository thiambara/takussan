/**
 * TCK-2963 — la salle à l'écran : le bandeau relu pour son lecteur, le dossier sans coordonnée du bailleur
 * (AC2) ni honoraires pour le locataire, la raison de la lecture seule (AC3).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

import { AGENT, BAILLEUR, EMAIL_DU_BAILLEUR, LOCATAIRE, TELEPHONE_DU_BAILLEUR, bail, reservation, salleDeLaReservation, salleDuBail } from './donnees';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

let lecteur = AGENT;
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: lecteur, roles: [] }, token: 'jeton' }) }));

const { BandeauDeLaSalle } = await import('../BandeauDeLaSalle');
const { DossierDuFil } = await import('../DossierDuFil');
const { LectureSeuleDeLaSalle } = await import('../LectureSeuleDeLaSalle');

let reponseDuBail: Record<string, unknown> = bail();

function repondre(chemin: string) {
  if (chemin.startsWith('/api/leases/12')) return Promise.resolve({ data: reponseDuBail });
  if (chemin.startsWith('/api/bookings/7')) return Promise.resolve({ data: reservation() });
  if (chemin.startsWith('/api/documents/generated')) return Promise.resolve({ data: [{ kind: 'generated', category: 'lease_contract', title: null, date: '2026-11-28', download_path: '/x.pdf' }] });
  if (chemin.startsWith('/api/documents')) return Promise.resolve({ data: [], meta: { current_page: 1, last_page: 1, per_page: 5, total: 0 } });
  return Promise.reject(new Error(`inattendu : ${chemin}`));
}

function monter(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation((chemin: string) => repondre(chemin));
  reponseDuBail = bail();
  lecteur = AGENT;
});

describe('<BandeauDeLaSalle> — relu pour son lecteur', () => {
  it('l’agent lit la prochaine échéance, le solde et la fin de période', async () => {
    monter(<BandeauDeLaSalle conversation={salleDuBail()} onDossier={() => undefined} />);
    const bandeau = await screen.findByRole('region', { name: 'Où en est l’objet de ce fil' });
    expect(within(bandeau).getByText('Actif')).toBeInTheDocument();
    expect(within(bandeau).getByText(/LS-3SC8NQ · habitation/)).toBeInTheDocument();
    expect(within(screen.getByTestId('chiffre-echeance')).getByText('Prochaine échéance')).toBeInTheDocument();
    expect(within(screen.getByTestId('chiffre-echeance')).getByText(/470[\s  ,.]?000/)).toBeInTheDocument();
    expect(within(screen.getByTestId('chiffre-solde')).getByText('À jour')).toBeInTheDocument();
    expect(within(screen.getByTestId('chiffre-solde')).queryByText('Rien à régler')).toBeNull();
    expect(within(screen.getByTestId('chiffre-periode')).getByText('Fin de période')).toBeInTheDocument();
  });

  it('le locataire lit « Votre bail », « Prochain loyer » et « Rien à régler »', async () => {
    lecteur = LOCATAIRE;
    monter(<BandeauDeLaSalle conversation={salleDuBail()} onDossier={() => undefined} />);
    expect(await screen.findByText(/Votre bail · habitation/)).toBeInTheDocument();
    expect(screen.queryByText(/LS-3SC8NQ/)).toBeNull();
    expect(within(screen.getByTestId('chiffre-echeance')).getByText('Prochain loyer')).toBeInTheDocument();
    expect(within(screen.getByTestId('chiffre-solde')).getByText('Rien à régler')).toBeInTheDocument();
  });

  it('le bailleur lit la référence et la prochaine échéance, sans le libellé du locataire', async () => {
    lecteur = BAILLEUR;
    monter(<BandeauDeLaSalle conversation={salleDuBail()} onDossier={() => undefined} />);
    expect(await screen.findByText(/LS-3SC8NQ/)).toBeInTheDocument();
    expect(within(screen.getByTestId('chiffre-echeance')).getByText('Prochaine échéance')).toBeInTheDocument();
    expect(screen.queryByText('Rien à régler')).toBeNull();
  });

  it('un loyer en retard se dit en montant et en nombre d’échéances', async () => {
    reponseDuBail = bail({ overdue_count: 2, overdue_amount: 940000 });
    monter(<BandeauDeLaSalle conversation={salleDuBail()} onDossier={() => undefined} />);
    const solde = await screen.findByTestId('chiffre-solde');
    expect(within(solde).getByText(/940[\s  ,.]?000/)).toBeInTheDocument();
    expect(within(solde).getByText('2 échéances en retard')).toBeInTheDocument();
  });

  it('en préavis, la sortie remplace la fin de période', async () => {
    reponseDuBail = bail({ status: 'terminating', early_termination_effective_date: '2027-05-31' });
    monter(<BandeauDeLaSalle conversation={salleDuBail()} onDossier={() => undefined} />);
    expect(await screen.findByText(/Préavis · sortie le/)).toBeInTheDocument();
    expect(within(screen.getByTestId('chiffre-periode')).getByText('Sortie')).toBeInTheDocument();
  });

  it('la réservation : statut, arrivée, départ, montant', async () => {
    monter(<BandeauDeLaSalle conversation={salleDeLaReservation()} onDossier={() => undefined} />);
    expect(await screen.findByText('En attente de réponse')).toBeInTheDocument();
    expect(within(screen.getByTestId('chiffre-montant')).getByText(/350[\s  ,.]?000/)).toBeInTheDocument();
    expect(screen.getByTestId('chiffre-arrivee')).toHaveTextContent('Arrivée');
  });

  it('lit le bail sans demander le bailleur ni l’agent (le show ne porte que le compte du locataire)', async () => {
    monter(<BandeauDeLaSalle conversation={salleDuBail()} onDossier={() => undefined} />);
    await screen.findByTestId('chiffre-solde');
    const [chemin] = apiRequest.mock.calls.find(([c]) => String(c).startsWith('/api/leases/12'))!;
    const url = decodeURIComponent(String(chemin));
    expect(url).toContain('include=tenant,due_summary');
    expect(url).toContain('fields[customers]=id,user_id');
    expect(url).not.toMatch(/landlord|agent/);
  });
});

describe('<DossierDuFil> — aucune coordonnée du bailleur (AC2), rien que la lecture rend', () => {
  it('le personnel ne lit ni le téléphone ni l’e-mail du bailleur, même quand la réponse les porte', async () => {
    reponseDuBail = bail({ commission_amount: 47000 });
    monter(<DossierDuFil conversation={salleDuBail()} forme="feuille" />);
    const membres = await screen.findByTestId('membres-de-la-salle');
    expect(within(membres).getByText('Mouhamed Sène')).toBeInTheDocument();
    expect(within(membres).getByText('Bailleur')).toBeInTheDocument();
    expect(within(membres).getByText('Locataire')).toBeInTheDocument();
    expect(within(membres).getByText('Vous · Agent attribué')).toBeInTheDocument();
    const texte = document.body.textContent ?? '';
    expect(texte).not.toContain(TELEPHONE_DU_BAILLEUR);
    expect(texte).not.toContain(EMAIL_DU_BAILLEUR);
    expect(texte).not.toMatch(/\+221/);
  });

  it('le personnel lit honoraires et net reversé quand l’API rend `commission_amount`', async () => {
    reponseDuBail = bail({ commission_amount: 47000 });
    monter(<DossierDuFil conversation={salleDuBail()} forme="feuille" />);
    const montants = await screen.findByTestId('montants-de-la-salle');
    expect(within(montants).getByText('Honoraires de gestion')).toBeInTheDocument();
    expect(within(montants).getByText('Net reversé au bailleur')).toBeInTheDocument();
    expect(within(montants).getByText(/423[\s  ,.]?000/)).toBeInTheDocument();
  });

  it('le locataire ne lit ni honoraires ni net reversé, même quand le taux est dans la réponse', async () => {
    lecteur = LOCATAIRE;
    monter(<DossierDuFil conversation={salleDuBail()} forme="feuille" />);
    const montants = await screen.findByTestId('montants-de-la-salle');
    expect(within(montants).getByText('Loyer')).toBeInTheDocument();
    expect(within(montants).queryByText('Honoraires de gestion')).toBeNull();
    expect(within(montants).queryByText('Net reversé au bailleur')).toBeNull();
    expect(within(screen.getByTestId('membres-de-la-salle')).getByText('Vous · Locataire')).toBeInTheDocument();
  });

  it('les documents mènent à l’onglet de la fiche, et le dossier à la fiche du bail', async () => {
    monter(<DossierDuFil conversation={salleDuBail()} forme="feuille" />);
    const documents = await screen.findByTestId('documents-de-la-salle');
    expect(within(documents).getByRole('link', { name: /Contrat de bail/ })).toHaveAttribute('href', '/app/leases/12?onglet=documents');
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche du bail' })).toHaveAttribute('href', '/app/leases/12');
  });

  it('la réservation : candidat et contact du bien, lien vers la réservation', async () => {
    monter(<DossierDuFil conversation={salleDeLaReservation()} forme="colonne" />);
    const membres = await screen.findByTestId('membres-de-la-salle');
    expect(within(membres).getByText('Candidat')).toBeInTheDocument();
    expect(within(membres).getAllByText(/Contact du bien/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Ouvrir la réservation' })).toHaveAttribute('href', '/app/bookings/7');
  });
});

describe('<LectureSeuleDeLaSalle> — la raison, composée par le front (AC3)', () => {
  it('un bail résilié', async () => {
    reponseDuBail = bail({ status: 'terminated' });
    monter(<LectureSeuleDeLaSalle conversation={salleDuBail()} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ce bail a pris fin'));
  });

  it('une réservation refusée', async () => {
    apiRequest.mockImplementation((chemin: string) =>
      chemin.startsWith('/api/bookings/7') ? Promise.resolve({ data: reservation({ status: 'rejected' }) }) : repondre(chemin),
    );
    monter(<LectureSeuleDeLaSalle conversation={salleDeLaReservation()} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Cette réservation est close'));
  });

  it('un fil fermé', () => {
    monter(<LectureSeuleDeLaSalle conversation={salleDuBail({ status: 'closed' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ce fil est fermé');
  });
});
