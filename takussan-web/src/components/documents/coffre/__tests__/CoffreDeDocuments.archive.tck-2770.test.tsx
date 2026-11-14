/**
 * TCK-2770 — « Tout télécharger » : l'archive `.zip` d'un dossier en lot (quittances, relevés),
 * servie par `GET /api/me/document-vault/archive?folder=`.
 *
 * - au téléphone, dans la carte du dossier replié (maquette `DossierMobile`) ; au bureau, à droite du
 *   titre, « (.zip) » compris (`CoffreBureau`) ;
 * - ni sur « Mon bail » ni sur « Mes pièces » ;
 * - un état en cours (le geste se désactive et le dit) et un échec lisible, distinct de celui d'un
 *   document seul.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import { cheminDeLArchive, type CoffreDeDocuments as Coffre, type DossierVu, type EntreeDuCoffre } from '@/lib/documents/coffre';

type Etat = { telecharger: ReturnType<typeof vi.fn>; enCours: boolean; echec: 'interdit' | 'indisponible' | 'echec' | null };
const unDocument: Etat = { telecharger: vi.fn().mockResolvedValue(true), enCours: false, echec: null };
const lArchive: Etat = { telecharger: vi.fn().mockResolvedValue(true), enCours: false, echec: null };
// Le coffre appelle le crochet deux fois par rendu, dans cet ordre : un document, puis l'archive.
let appels = 0;
vi.mock('@/hooks/useTelechargementApi', () => ({
  useTelechargementApi: () => (appels++ % 2 === 0 ? unDocument : lArchive),
}));

const ecran = { bureau: false };
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.bureau }));

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

const genere = (category: string, date: string, chemin: string): EntreeDuCoffre => ({
  kind: 'generated',
  category,
  title: null,
  date,
  download_path: chemin,
  targets: [],
  document_id: null,
  is_verified: null,
  expiry_date: null,
  versions_count: null,
});

const COFFRE: Coffre = {
  folders: [
    {
      key: 'lease:22',
      kind: 'lease',
      target: { type: 'lease', id: 22 },
      name: 'Garage à Ouest Foire',
      year: null,
      read_only: false,
      entries: [genere('lease_contract', '2026-06-29', '/api/leases/22/contract/pdf')],
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
          expiry_date: null,
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
      entries: [genere('receipt_rent', '2026-10-05', '/api/leases/22/receipts/195/pdf'), genere('receipt_rent', '2026-11-05', '/api/leases/22/receipts/196/pdf')],
    },
    {
      key: 'statements',
      kind: 'statements',
      target: null,
      name: null,
      year: null,
      read_only: false,
      entries: [genere('owner_statement', '2026-10-31', '/api/owner-statements/pdf?period=2026-10&agency_id=3')],
    },
  ],
  counts: { expiring_soon: 0, unverified: 0 },
  attachable_targets: [],
};

const dossier = (nom: string) => screen.getByRole('region', { name: nom });
const rendre = () => render(withIntl(<CoffreDeDocuments />));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
  appels = 0;
  for (const etat of [unDocument, lArchive]) {
    etat.telecharger.mockClear();
    etat.enCours = false;
    etat.echec = null;
  }
  ecran.bureau = false;
  reponse.data = { data: COFFRE };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TCK-2770 — « Tout télécharger », au téléphone', () => {
  it('le dossier replié des quittances porte le geste, qui demande l’archive de CE dossier', () => {
    rendre();
    const quittances = dossier('Quittances 2026');
    // Replié : le résumé ouvre le dossier, le geste est à côté.
    expect(within(quittances).getByRole('button', { name: /^Quittances 2026/ })).toHaveAttribute('aria-expanded', 'false');
    const geste = within(quittances).getByRole('button', { name: 'Tout télécharger : Quittances 2026' });
    expect(geste).toHaveTextContent('Tout télécharger');

    fireEvent.click(geste);
    expect(lArchive.telecharger).toHaveBeenCalledWith('/api/me/document-vault/archive?folder=receipts%3A2026', 'Quittances 2026.zip');
    expect(unDocument.telecharger).not.toHaveBeenCalled();
    // Le geste n'ouvre pas le dossier.
    expect(within(quittances).getByRole('button', { name: /^Quittances 2026/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('ni « Mon bail » ni « Mes pièces » ne le portent', () => {
    rendre();
    expect(within(dossier('Mon bail')).queryByRole('button', { name: /Tout télécharger/ })).not.toBeInTheDocument();
    expect(within(dossier('Mes pièces')).queryByRole('button', { name: /Tout télécharger/ })).not.toBeInTheDocument();
  });

  it('en cours, il le dit et ne se relance pas', () => {
    lArchive.enCours = true;
    rendre();
    const geste = within(dossier('Quittances 2026')).getByRole('button', { name: 'Préparation de l’archive…' });
    expect(geste).toBeDisabled();
    expect(geste).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(geste);
    expect(lArchive.telecharger).not.toHaveBeenCalled();
  });

  it('un refus de l’API se lit : le dossier est à télécharger document par document', () => {
    lArchive.echec = 'indisponible';
    rendre();
    expect(screen.getByTestId('echec-de-l-archive')).toHaveTextContent(
      'Ce dossier ne peut pas être réuni en une archive. Téléchargez ses documents un par un.',
    );
  });
});

describe('TCK-2770 — « Tout télécharger (.zip) », au bureau', () => {
  it('à droite du titre des quittances et des relevés, pas ailleurs', () => {
    ecran.bureau = true;
    rendre();
    const titreQuittances = within(dossier('Quittances 2026')).getByRole('heading', { level: 2 });
    fireEvent.click(within(titreQuittances).getByRole('button', { name: 'Tout télécharger : Quittances 2026' }));
    expect(lArchive.telecharger).toHaveBeenCalledWith('/api/me/document-vault/archive?folder=receipts%3A2026', 'Quittances 2026.zip');
    expect(titreQuittances).toHaveTextContent('Tout télécharger (.zip)');

    const titreReleves = within(dossier('Relevés et attestations')).getByRole('heading', { level: 2 });
    fireEvent.click(within(titreReleves).getByRole('button', { name: 'Tout télécharger : Relevés et attestations' }));
    expect(lArchive.telecharger).toHaveBeenLastCalledWith('/api/me/document-vault/archive?folder=statements', 'Relevés et attestations.zip');
    expect(within(dossier('Mon bail')).queryByRole('button', { name: /Tout télécharger/ })).not.toBeInTheDocument();
  });
});

describe('TCK-2770 — cheminDeLArchive', () => {
  const vu = (key: string, kind: DossierVu['kind'], n: number) => ({ key, kind, entrees: Array.from({ length: n }) as DossierVu['entrees'] });

  it('les quittances et les relevés non vides ont une archive, encodée', () => {
    expect(cheminDeLArchive(vu('receipts:2025', 'receipts', 3))).toBe('/api/me/document-vault/archive?folder=receipts%3A2025');
    expect(cheminDeLArchive(vu('statements', 'statements', 1))).toBe('/api/me/document-vault/archive?folder=statements');
  });

  it('aucun autre dossier, ni un dossier vide', () => {
    expect(cheminDeLArchive(vu('lease:22', 'lease', 3))).toBeNull();
    expect(cheminDeLArchive(vu('property:7', 'property', 3))).toBeNull();
    expect(cheminDeLArchive(vu('pieces', 'pieces', 3))).toBeNull();
    expect(cheminDeLArchive(vu('bills', 'bills', 3))).toBeNull();
    expect(cheminDeLArchive(vu('receipts:2026', 'receipts', 0))).toBeNull();
  });
});
