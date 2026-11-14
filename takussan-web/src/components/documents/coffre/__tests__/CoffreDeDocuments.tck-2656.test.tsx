/**
 * TCK-2656 (lot 1) — le coffre du locataire :
 *
 * - AC1 : « Mon bail » contient le contrat, « Quittances 2026 » compte autant d'entrées que l'API en
 *   rend, et « 0 document » n'apparaît pas ;
 * - AC4 : une pièce qui expire dans 42 jours porte « expire dans 42 jours », et l'alerte la nomme ;
 * - ADR-0099 : un document généré se télécharge par son endpoint, sans aucun geste de gestion ;
 * - AC6 : au bureau large (≥ 1280), l'arborescence, la liste et l'aperçu sont rendus côte à côte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import type { CoffreDeDocuments as Coffre, EntreeDuCoffre } from '@/lib/documents/coffre';

const telecharger = vi.fn().mockResolvedValue(true);
vi.mock('@/hooks/useTelechargementApi', () => ({
  useTelechargementApi: () => ({ telecharger, enCours: false, echec: null }),
}));

const ecran = { bureau: false };
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.bureau }));

// TCK-2769 — la recherche du coffre vit dans l'URL (`?q=`) ; sans elle, le coffre par dossier.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/app/documents',
}));

const reponse: { data: { data: Coffre } | undefined } = { data: undefined };
vi.mock('@/lib/queries/coffre', () => ({
  // TCK-2812 — l'archive préparée : rien de demandé ici.
  useArchivesPreparees: () => ({ data: undefined }),
  useDemanderLArchive: () => ({ isPending: false, isError: false, mutate: () => undefined }),
  useCoffreDeDocuments: () => ({ isPending: false, isError: false, data: reponse.data, refetch: vi.fn() }),
  useRechercheDansLeCoffre: () => ({ isPending: true }),
}));

import { CoffreDeDocuments } from '../CoffreDeDocuments';

const genere = (category: string, date: string, chemin: string, title: string | null = null): EntreeDuCoffre => ({
  kind: 'generated',
  category,
  title,
  date,
  download_path: chemin,
  targets: [{ type: 'lease', id: 22 }],
  document_id: null,
  is_verified: null,
  expiry_date: null,
  versions_count: null,
});

/**
 * Le coffre de `locataire-f4` tel que l'API l'a rendu le 2026-11-13 (`f4.json` : bail 22, 3 entrées ;
 * 6 quittances 2026 ; « Mes pièces » vide), plus une carte d'identité qui expire dans 42 jours (AC4 :
 * aucune pièce de la démo n'expire dans la fenêtre).
 */
const COFFRE_F4: Coffre = {
  folders: [
    {
      key: 'lease:22',
      kind: 'lease',
      target: { type: 'lease', id: 22 },
      name: 'Garage à Ouest Foire',
      year: null,
      read_only: false,
      entries: [
        genere('lease_contract', '2026-06-29', '/api/leases/22/contract/pdf', 'LS-0DPA75TK'),
        genere('inventory_move_in', '2026-07-01', '/api/inventories/25/pdf'),
        {
          kind: 'uploaded',
          category: 'lease_contract',
          title: 'Contrat de bail LS-0DPA75TK',
          date: '2026-07-01',
          download_path: '/api/documents/210',
          targets: [{ type: 'lease', id: 22 }],
          document_id: 210,
          is_verified: true,
          expiry_date: null,
          versions_count: 0,
        },
      ],
    },
    {
      key: 'pieces',
      kind: 'pieces',
      target: { type: 'user', id: 78 },
      name: null,
      year: null,
      read_only: false,
      entries: [
        {
          kind: 'uploaded',
          category: 'id_card',
          title: 'Carte d’identité',
          date: '2026-06-28',
          download_path: '/api/documents/301',
          targets: [],
          document_id: 301,
          is_verified: true,
          expiry_date: '2026-12-25',
          versions_count: 0,
        },
      ],
    },
    {
      key: 'receipts:2026',
      kind: 'receipts',
      target: null,
      name: null,
      year: 2026,
      read_only: false,
      entries: [
        genere('receipt_deposit', '2026-07-01', '/api/leases/22/receipts/191/pdf', 'LPY-JMQLQ0'),
        genere('receipt_rent', '2026-07-05', '/api/leases/22/receipts/192/pdf'),
        genere('receipt_rent', '2026-08-05', '/api/leases/22/receipts/193/pdf'),
        genere('receipt_rent', '2026-09-05', '/api/leases/22/receipts/194/pdf'),
        genere('receipt_rent', '2026-10-05', '/api/leases/22/receipts/195/pdf'),
        genere('receipt_rent', '2026-11-05', '/api/leases/22/receipts/196/pdf'),
      ],
    },
  ],
  counts: { expiring_soon: 1, unverified: 0 },
  attachable_targets: [
    { type: 'user', id: 78, folder: 'pieces', name: null },
    { type: 'lease', id: 22, folder: 'lease:22', name: 'Garage à Ouest Foire' },
  ],
};

function rendre() {
  return render(withIntl(<CoffreDeDocuments />));
}

const dossier = (nom: string) => screen.getByRole('region', { name: nom });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
  telecharger.mockClear();
  ecran.bureau = false;
  reponse.data = { data: COFFRE_F4 };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TCK-2656 — le coffre du locataire, au téléphone', () => {
  it('AC1 — « Mon bail » contient le contrat et l’état des lieux, « Quittances 2026 » compte les six quittances', () => {
    rendre();
    const bail = dossier('Mon bail');
    expect(within(bail).getByText('Contrat de bail signé')).toBeInTheDocument();
    expect(within(bail).getByText('État des lieux d’entrée')).toBeInTheDocument();
    expect(within(bail).getAllByText('Généré par Takussan')).toHaveLength(2);

    const quittances = dossier('Quittances 2026');
    // Replié : son compte, et le résumé des mois, du plus récent au plus ancien.
    expect(within(quittances).getByRole('button', { name: /^Quittances 2026/ })).toHaveAttribute('aria-expanded', 'false');
    expect(within(quittances).getByText('6')).toBeInTheDocument();
    expect(within(quittances).getByText(/^nov\. · oct\. · sept\. · août · juil\. · caution$/)).toBeInTheDocument();

    fireEvent.click(within(quittances).getByRole('button', { name: /^Quittances 2026/ }));
    expect(within(quittances).getAllByTestId('entree-du-coffre')).toHaveLength(6);
    expect(within(quittances).getByText('Quittance de novembre')).toBeInTheDocument();
    expect(within(quittances).getByText('Quittance d’octobre')).toBeInTheDocument();
    expect(within(quittances).getByText('Reçu de caution')).toBeInTheDocument();

    expect(screen.queryByText(/(^|\D)0 document/)).not.toBeInTheDocument();
    expect(screen.getByText('10 documents')).toBeInTheDocument();
  });

  it('AC4 — la pièce qui expire dans 42 jours le dit, et l’alerte la nomme avec « Remplacer »', () => {
    rendre();
    expect(within(dossier('Mes pièces')).getByText('expire dans 42 jours')).toBeInTheDocument();
    expect(within(dossier('Mes pièces')).getByText('Vérifié')).toBeInTheDocument();
    expect(within(dossier('Mon bail')).getAllByText('Vérifié')).toHaveLength(1);
    const alerte = screen.getByTestId('alerte-d-expiration');
    expect(alerte).toHaveTextContent('Votre Carte d’identité expire dans 42 jours.');
    expect(within(alerte).getByRole('link', { name: 'Remplacer' })).toHaveAttribute('href', '/app/documents/301');
  });

  it('un document généré se télécharge par son endpoint, sans geste de gestion ; une pièce ouvre sa fiche', () => {
    rendre();
    const bail = dossier('Mon bail');
    fireEvent.click(within(bail).getByRole('button', { name: /Contrat de bail signé/ }));
    expect(telecharger).toHaveBeenCalledWith('/api/leases/22/contract/pdf', 'Contrat de bail signé.pdf');
    expect(within(bail).queryByRole('button', { name: /Partager|Supprimer|Nouvelle version|Vérifier/ })).not.toBeInTheDocument();

    expect(within(dossier('Mes pièces')).getByRole('link', { name: /Carte d’identité/ })).toHaveAttribute('href', '/app/documents/301');
  });

  it('les puces filtrent par dossier, et ouvrent un dossier replié', () => {
    rendre();
    const puces = screen.getByRole('group', { name: 'Filtrer par dossier' });
    fireEvent.click(within(puces).getByRole('button', { name: /^Quittances 2026/ }));
    expect(screen.queryByRole('region', { name: 'Mon bail' })).not.toBeInTheDocument();
    expect(within(dossier('Quittances 2026')).getAllByTestId('entree-du-coffre')).toHaveLength(6);
  });

  it('sans cible rattachable (impersonation), aucun bouton d’ajout', () => {
    reponse.data = { data: { ...COFFRE_F4, attachable_targets: [] } };
    rendre();
    expect(screen.queryByRole('button', { name: /Ajouter/ })).not.toBeInTheDocument();
  });

  it('le coffre de locataire propose l’ajout', () => {
    rendre();
    expect(screen.getAllByRole('button', { name: 'Ajouter un document' }).length).toBeGreaterThan(0);
  });

  it('le coffre vide accueille le locataire et propose « Ajouter ma première pièce », sans « 0 document »', () => {
    reponse.data = {
      data: {
        folders: [{ key: 'pieces', kind: 'pieces', target: { type: 'user', id: 78 }, name: null, year: null, read_only: false, entries: [] }],
        counts: { expiring_soon: 0, unverified: 0 },
        attachable_targets: [{ type: 'user', id: 78, folder: 'pieces', name: null }],
      },
    };
    rendre();
    expect(screen.getByRole('heading', { name: 'Vos pièces, votre contrat et vos quittances' })).toBeInTheDocument();
    expect(screen.getByText('Pièce d’identité, attestation de travail, assurance : ce que l’agence vous demande.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ajouter ma première pièce' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/(^|\D)0 document/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Glissez/)).not.toBeInTheDocument();
  });
});

describe('TCK-2656 — le coffre du bailleur', () => {
  it('décision 1 (a) — un dossier par bien qui a des documents, les autres comptés ; « Relevés et attestations » replié', () => {
    reponse.data = {
      data: {
        folders: [
          {
            key: 'property:4',
            kind: 'property',
            target: { type: 'property', id: 4 },
            name: 'Villa Almadies',
            year: null,
            read_only: false,
            entries: [genere('lease_contract', '2026-01-12', '/api/leases/9/contract/pdf', 'LS-AAAA')],
          },
          { key: 'property:5', kind: 'property', target: { type: 'property', id: 5 }, name: 'Appartement Mermoz', year: null, read_only: false, entries: [] },
          { key: 'property:6', kind: 'property', target: { type: 'property', id: 6 }, name: 'Garage Ouest Foire', year: null, read_only: false, entries: [] },
          { key: 'pieces', kind: 'pieces', target: { type: 'user', id: 12 }, name: null, year: null, read_only: false, entries: [] },
          {
            key: 'statements',
            kind: 'statements',
            target: null,
            name: null,
            year: null,
            read_only: false,
            entries: [
              genere('owner_statement', '2026-09-30', '/api/owner-statements/2026-09/pdf', '2026-09'),
              genere('owner_statement', '2026-10-31', '/api/owner-statements/2026-10/pdf', '2026-10'),
              genere('annual_attestation', '2025-12-31', '/api/owner-statements/2025/pdf', '2025'),
            ],
          },
        ],
        counts: { expiring_soon: 0, unverified: 0 },
        attachable_targets: [{ type: 'user', id: 12, folder: 'pieces', name: null }],
      },
    };
    rendre();
    expect(dossier('Villa Almadies')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Appartement Mermoz' })).not.toBeInTheDocument();
    expect(screen.getByTestId('biens-sans-document')).toHaveTextContent('2 biens sans document');
    const releves = dossier('Relevés et attestations');
    // Replié : le mois de chaque relevé, l'année de l'attestation.
    expect(within(releves).getByText('oct. · sept. · 2025')).toBeInTheDocument();
    fireEvent.click(within(releves).getByRole('button', { name: /^Relevés et attestations/ }));
    expect(within(releves).getAllByTestId('entree-du-coffre').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Relevé d’octobre 2026'),
      expect.stringContaining('Relevé de septembre 2026'),
      expect.stringContaining('Attestation annuelle 2025'),
    ]);
    // Pas l'accueil du locataire.
    expect(screen.queryByRole('heading', { name: 'Vos pièces, votre contrat et vos quittances' })).not.toBeInTheDocument();
  });

  it('un bailleur sans aucun document n’a pas l’accueil du locataire', () => {
    reponse.data = {
      data: {
        folders: [
          { key: 'property:5', kind: 'property', target: { type: 'property', id: 5 }, name: 'Appartement Mermoz', year: null, read_only: false, entries: [] },
          { key: 'pieces', kind: 'pieces', target: { type: 'user', id: 12 }, name: null, year: null, read_only: false, entries: [] },
        ],
        counts: { expiring_soon: 0, unverified: 0 },
        attachable_targets: [{ type: 'user', id: 12, folder: 'pieces', name: null }],
      },
    };
    rendre();
    expect(screen.getByTestId('biens-sans-document')).toHaveTextContent('1 bien sans document');
    expect(screen.queryByRole('heading', { name: 'Vos pièces, votre contrat et vos quittances' })).not.toBeInTheDocument();
  });
});

describe('TCK-2656 — le coffre au bureau large', () => {
  it('AC6 — l’arborescence, la liste et l’aperçu côte à côte ; choisir une ligne la montre dans l’aperçu', () => {
    ecran.bureau = true;
    rendre();
    const arbre = screen.getByRole('navigation', { name: 'Dossiers' });
    expect(within(arbre).getByRole('button', { name: /Tous les documents/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(arbre).getByRole('button', { name: /Expire bientôt/ })).toBeInTheDocument();
    const apercu = screen.getByRole('complementary', { name: 'Aperçu' });
    // La première entrée par défaut : le contrat.
    expect(within(apercu).getByText('Contrat de bail signé')).toBeInTheDocument();
    expect(within(apercu).getByText('LS-0DPA75TK')).toBeInTheDocument();

    // Les trois colonnes sont sœurs dans la même rangée (`xl:flex-row`).
    expect(arbre.parentElement).toBe(apercu.parentElement);
    expect(arbre.parentElement).toHaveClass('xl:flex-row');

    // Au bureau, un dossier de plus de quatre entrées en montre trois, puis « Voir les 3 autres ».
    const quittances = dossier('Quittances 2026');
    expect(within(quittances).getAllByTestId('entree-du-coffre')).toHaveLength(3);
    fireEvent.click(within(quittances).getByRole('button', { name: 'Voir les 3 autres' }));
    expect(within(quittances).getAllByTestId('entree-du-coffre')).toHaveLength(6);

    fireEvent.click(within(dossier('Mes pièces')).getByRole('button', { name: /Carte d’identité/ }));
    expect(within(apercu).getByText('Carte d’identité')).toBeInTheDocument();
    expect(within(apercu).getByRole('link', { name: 'Ouvrir la fiche' })).toHaveAttribute('href', '/app/documents/301');

    // « Expire bientôt » ne garde que la pièce dans la fenêtre.
    fireEvent.click(within(arbre).getByRole('button', { name: /Expire bientôt/ }));
    expect(screen.queryByRole('region', { name: 'Mon bail' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Quittances 2026' })).not.toBeInTheDocument();
    expect(within(dossier('Mes pièces')).getAllByTestId('entree-du-coffre')).toHaveLength(1);
  });
});

describe('TCK-2769 — chercher dans le coffre, et le bailleur bloqué (TCK-2729)', () => {
  it('« Chercher un document » est dans le coffre, au téléphone comme au bureau ; plus de geste « Rechercher »', () => {
    rendre();
    expect(screen.getByRole('searchbox', { name: 'Chercher un document' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Rechercher' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('coffre-lecture-seule')).not.toBeInTheDocument();
  });

  it('un coffre vide n’offre pas de recherche', () => {
    reponse.data = {
      data: {
        folders: [{ key: 'pieces', kind: 'pieces', target: { type: 'user', id: 78 }, name: null, year: null, read_only: false, entries: [] }],
        counts: { expiring_soon: 0, unverified: 0 },
        attachable_targets: [{ type: 'user', id: 78, folder: 'pieces', name: null }],
      },
    };
    rendre();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('le dossier d’un bien en lecture seule se lit, le coffre le dit, et sa pièce qui expire ne se remplace pas', () => {
    reponse.data = {
      data: {
        folders: [
          {
            key: 'property:4',
            kind: 'property',
            target: { type: 'property', id: 4 },
            name: 'Villa Almadies',
            year: null,
            read_only: true,
            entries: [
              {
                kind: 'uploaded',
                category: 'insurance',
                title: 'Assurance habitation',
                date: '2026-01-10',
                download_path: '/api/documents/77',
                targets: [{ type: 'property', id: 4 }],
                document_id: 77,
                is_verified: true,
                expiry_date: '2026-12-01',
                versions_count: 0,
              },
            ],
          },
          { key: 'pieces', kind: 'pieces', target: { type: 'user', id: 12 }, name: null, year: null, read_only: false, entries: [] },
        ],
        counts: { expiring_soon: 1, unverified: 0 },
        attachable_targets: [{ type: 'user', id: 12, folder: 'pieces', name: null }],
      },
    };
    rendre();
    expect(screen.getByTestId('coffre-lecture-seule')).toHaveTextContent(
      'Votre accès bailleur est suspendu : ces documents restent consultables, mais rien ne peut y être ajouté.',
    );
    expect(within(dossier('Villa Almadies')).getAllByTestId('entree-du-coffre')).toHaveLength(1);
    // Le dossier figé le dit lui-même ; « Mes pièces » non.
    expect(within(dossier('Villa Almadies')).getByText('Lecture seule')).toBeInTheDocument();
    expect(within(dossier('Mes pièces')).queryByText('Lecture seule')).not.toBeInTheDocument();
    const alerte = screen.getByTestId('alerte-d-expiration');
    expect(alerte).toHaveTextContent('Assurance habitation');
    expect(within(alerte).queryByRole('link', { name: 'Remplacer' })).not.toBeInTheDocument();
    // « Mes pièces » reste ouvert à l'ajout.
    expect(screen.getAllByRole('button', { name: /Ajouter/ }).length).toBeGreaterThan(0);

    // Au bureau aussi.
    ecran.bureau = true;
    const { unmount } = rendre();
    const regions = screen.getAllByRole('region', { name: 'Villa Almadies' });
    expect(within(regions[regions.length - 1]).getByText('Lecture seule')).toBeInTheDocument();
    unmount();
    ecran.bureau = false;

    // Filtré sur « Mes pièces », l'avis ne la concerne pas.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Dossiers' })).getByRole('button', { name: /^Mes pièces/ }));
    expect(screen.queryByTestId('coffre-lecture-seule')).not.toBeInTheDocument();
  });
});
