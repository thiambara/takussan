/**
 * TCK-2812 (ADR-0099, amendement du 2026-11-14) — « Tout télécharger » au-delà du seuil direct : le geste
 * demande une archive PRÉPARÉE, le dossier dit qu'elle se prépare (et qu'on peut quitter la page), puis le
 * bouton la télécharge quand elle est prête ; un échec se dit, avec « Réessayer ». En deçà du seuil, le
 * téléchargement direct de TCK-2770 ne change pas.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import {
  archivePreparee,
  SEUIL_DE_L_ARCHIVE_DIRECTE,
  type ArchivePreparee,
  type CoffreDeDocuments as Coffre,
  type DossierVu,
  type EntreeDuCoffre,
} from '@/lib/documents/coffre';

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
const preparees: { data: { data: ArchivePreparee[] } | undefined; enabled: boolean | undefined } = { data: undefined, enabled: undefined };
const demande: {
  isPending: boolean;
  isError: boolean;
  error: { status: number } | null;
  variables: { folder: string } | undefined;
  mutate: ReturnType<typeof vi.fn>;
} = { isPending: false, isError: false, error: null, variables: undefined, mutate: vi.fn() };
vi.mock('@/lib/queries/coffre', () => ({
  useCoffreDeDocuments: () => ({ isPending: false, isError: false, data: reponse.data, refetch: vi.fn() }),
  useRechercheDansLeCoffre: () => ({ isPending: true }),
  useArchivesPreparees: ({ enabled }: { enabled?: boolean } = {}) => {
    preparees.enabled = enabled;
    return { data: preparees.data };
  },
  useDemanderLArchive: () => demande,
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

/** 41 quittances : une de plus que le seuil direct. */
const QUITTANCES = Array.from({ length: SEUIL_DE_L_ARCHIVE_DIRECTE + 1 }, (_, i) =>
  genere('receipt_rent', `2026-${String((i % 12) + 1).padStart(2, '0')}-${String(10 + Math.floor(i / 12)).padStart(2, '0')}`, `/api/leases/22/receipts/${100 + i}/pdf`),
);

const COFFRE: Coffre = {
  folders: [
    { key: 'receipts:2026', kind: 'receipts', target: null, name: null, year: 2026, read_only: false, entries: QUITTANCES },
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

const preparation = (status: ArchivePreparee['status'], extra: Partial<ArchivePreparee> = {}): ArchivePreparee => ({
  id: '0b8f6a2e-5d1c-4f7a-9c3e-2a1b0c9d8e7f',
  folder: 'receipts:2026',
  status,
  error_code: null,
  entries_count: null,
  expires_at: null,
  created_at: '2026-11-14T10:00:00+00:00',
  download_path: null,
  ...extra,
});

const LIEN = '/api/me/document-vault/archives/0b8f6a2e-5d1c-4f7a-9c3e-2a1b0c9d8e7f/download?expires=1&signature=abc';

const dossier = (nom: string) => screen.getByRole('region', { name: nom });
const rendre = () => render(withIntl(<CoffreDeDocuments />));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
  appels = 0;
  for (const etat of [unDocument, lArchive]) {
    etat.telecharger.mockClear();
    etat.enCours = false;
    etat.echec = null;
  }
  ecran.bureau = false;
  reponse.data = { data: COFFRE };
  preparees.data = { data: [] };
  preparees.enabled = undefined;
  Object.assign(demande, { isPending: false, isError: false, error: null, variables: undefined });
  demande.mutate.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TCK-2812 — au-delà du seuil, « Tout télécharger » demande une archive préparée', () => {
  it('le geste demande la préparation de CE dossier, sans téléchargement direct', () => {
    rendre();
    expect(preparees.enabled).toBe(true);
    fireEvent.click(within(dossier('Quittances 2026')).getByRole('button', { name: 'Tout télécharger : Quittances 2026' }));

    expect(demande.mutate).toHaveBeenCalledWith({ folder: 'receipts:2026' });
    expect(lArchive.telecharger).not.toHaveBeenCalled();
  });

  it('AC7 — pendant la préparation, le dossier l’annonce, dit qu’on peut quitter la page, et le geste ne se relance pas', () => {
    preparees.data = { data: [preparation('pending')] };
    rendre();
    const quittances = dossier('Quittances 2026');

    expect(within(quittances).getByRole('status')).toHaveTextContent(
      'L’archive « Quittances 2026 » se prépare. Nous vous préviendrons dès qu’elle sera prête : vous pouvez quitter cette page.',
    );
    const geste = within(quittances).getByRole('button', { name: 'Préparation en cours…' });
    expect(geste).toBeDisabled();
    expect(geste).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(geste);
    expect(demande.mutate).not.toHaveBeenCalled();
  });

  it('AC7 — la demande partie, le geste dit déjà la préparation', () => {
    Object.assign(demande, { isPending: true, variables: { folder: 'receipts:2026' } });
    rendre();
    expect(within(dossier('Quittances 2026')).getByRole('button', { name: 'Préparation en cours…' })).toBeDisabled();
  });

  it('AC7 — prête, le geste télécharge l’archive par son lien signé', () => {
    preparees.data = { data: [preparation('ready', { download_path: LIEN, expires_at: '2026-11-15T10:00:00+00:00' })] };
    rendre();
    const quittances = dossier('Quittances 2026');

    expect(within(quittances).getByRole('status')).toHaveTextContent('L’archive « Quittances 2026 » est prête. Elle reste disponible 24 heures.');
    fireEvent.click(within(quittances).getByRole('button', { name: 'Télécharger l’archive : Quittances 2026' }));
    expect(lArchive.telecharger).toHaveBeenCalledWith(LIEN, 'Quittances 2026.zip');
    expect(demande.mutate).not.toHaveBeenCalled();
  });

  it('AC7 — un échec se dit, avec « Réessayer », qui relance la préparation', () => {
    preparees.data = { data: [preparation('failed', { error_code: 'document.archive_render_failed' })] };
    rendre();
    const quittances = dossier('Quittances 2026');

    expect(within(quittances).getByRole('alert')).toHaveTextContent('L’archive « Quittances 2026 » n’a pas pu être préparée. Réessayez.');
    const reessayer = within(quittances).getByRole('button', { name: 'Réessayer l’archive : Quittances 2026' });
    expect(reessayer).toHaveTextContent('Réessayer');
    fireEvent.click(reessayer);
    expect(demande.mutate).toHaveBeenCalledWith({ folder: 'receipts:2026' });
  });

  it('une demande refusée se lit : 422 (au-delà du plafond préparé) renvoie au document par document, le reste à « Réessayez »', () => {
    Object.assign(demande, { isError: true, error: { status: 422 } });
    const { unmount } = rendre();
    expect(screen.getByTestId('echec-de-la-demande-d-archive')).toHaveTextContent(
      'Ce dossier ne peut pas être réuni en une archive. Téléchargez ses documents un par un.',
    );
    unmount();

    Object.assign(demande, { isError: true, error: { status: 500 } });
    rendre();
    expect(screen.getByTestId('echec-de-la-demande-d-archive')).toHaveTextContent('La préparation de l’archive n’a pas pu être demandée. Réessayez.');
  });

  it('au bureau, prête : « Télécharger l’archive (.zip) » à droite du titre', () => {
    ecran.bureau = true;
    preparees.data = { data: [preparation('ready', { download_path: LIEN })] };
    rendre();
    const titre = within(dossier('Quittances 2026')).getByRole('heading', { level: 2 });
    expect(within(titre).getByRole('button', { name: 'Télécharger l’archive : Quittances 2026' })).toHaveTextContent('Télécharger l’archive (.zip)');
  });
});

describe('TCK-2812 — en deçà du seuil, le téléchargement direct de TCK-2770 ne change pas', () => {
  it('« Relevés et attestations » (1 entrée) se télécharge directement, sans préparation', () => {
    rendre();
    fireEvent.click(within(dossier('Relevés et attestations')).getByRole('button', { name: 'Tout télécharger : Relevés et attestations' }));

    expect(lArchive.telecharger).toHaveBeenCalledWith('/api/me/document-vault/archive?folder=statements', 'Relevés et attestations.zip');
    expect(demande.mutate).not.toHaveBeenCalled();
    expect(within(dossier('Relevés et attestations')).queryByTestId('note-d-archive')).not.toBeInTheDocument();
  });

  it('sans dossier au-delà du seuil, l’état des préparations n’est pas lu', () => {
    reponse.data = { data: { ...COFFRE, folders: COFFRE.folders.filter((f) => f.key === 'statements') } };
    rendre();
    expect(preparees.enabled).toBe(false);
  });
});

describe('TCK-2812 — archivePreparee et le seuil', () => {
  const vu = (key: string, kind: DossierVu['kind'], n: number) => ({ key, kind, entrees: Array.from({ length: n }) as DossierVu['entrees'] });

  it('seulement un dossier en lot, au-delà du seuil', () => {
    expect(archivePreparee(vu('receipts:2026', 'receipts', SEUIL_DE_L_ARCHIVE_DIRECTE + 1))).toBe(true);
    expect(archivePreparee(vu('statements', 'statements', SEUIL_DE_L_ARCHIVE_DIRECTE + 1))).toBe(true);
    expect(archivePreparee(vu('receipts:2026', 'receipts', SEUIL_DE_L_ARCHIVE_DIRECTE))).toBe(false);
    expect(archivePreparee(vu('lease:22', 'lease', SEUIL_DE_L_ARCHIVE_DIRECTE + 1))).toBe(false);
  });

  it('le seuil est celui de l’API (`ArchiveDuCoffre::MAX_FICHIERS`)', () => {
    const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
    const php = readFileSync(join(racine, 'takussan-api', 'app', 'Services', 'Documents', 'ArchiveDuCoffre.php'), 'utf8');
    const max = /public const MAX_FICHIERS = (\d+);/.exec(php);
    expect(max, 'MAX_FICHIERS introuvable dans ArchiveDuCoffre.php').not.toBeNull();
    expect(SEUIL_DE_L_ARCHIVE_DIRECTE).toBe(Number(max?.[1]));
  });
});
