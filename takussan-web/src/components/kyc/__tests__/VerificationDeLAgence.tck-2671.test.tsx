import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { KycDocument, KycDossier } from '@/types/super-admin';

/**
 * TCK-2671 — « Vérification de l'agence » : un état, une phrase, une action.
 *
 * AC1 — un dossier vérifié dont l'échéance tombe dans 20 jours : « Remplacer la pièce d'identité »
 * est actif et l'envoi aboutit (l'API rend 201). AC2 — tout bouton `disabled` porte un
 * `aria-describedby` vers un texte visible qui dit pourquoi.
 */

const kyc = vi.hoisted(() => ({
  fetchAgencyKyc: vi.fn(),
  uploadAgencyKycDocument: vi.fn(),
  submitAgencyKyc: vi.fn(),
}));
vi.mock('@/lib/queries/kyc', () => kyc);
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
// Le calendrier de base-ui ne s'ouvre pas sous jsdom : un champ date nu tient sa place.
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    value,
    min,
    onValueChange,
    'aria-label': label,
  }: {
    value?: string;
    min?: string;
    onValueChange: (v: string) => void;
    'aria-label'?: string;
  }) => <input type="date" aria-label={label} min={min} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />,
}));

import { demainIso } from '@/lib/kyc-echeance';
import { KYC_MIME_ACCEPT } from '../kyc-mime-accept';
import { VerificationDeLAgence } from '../VerificationDeLAgence';

const V = fr.kyc.verification;
const AUJOURDHUI = new Date(2026, 10, 12, 10, 0);
const piece = (document_type: string, extra: Partial<KycDocument> = {}): KycDocument => ({
  id: document_type.length + (extra.document_expires_at ? 100 : 0),
  file_name: `${document_type}.pdf`,
  mime_type: 'application/pdf',
  size: 1,
  document_type,
  signed_url: `/kyc/${document_type}`,
  expires_at: '2026-11-12T10:15:00Z',
  document_expires_at: null,
  document_number: null,
  ...extra,
});
const TROIS = [
  piece('rccm', { document_number: 'SN-DKR-2017-B-8841' }),
  piece('ninea', { document_number: '005123456' }),
  piece('director_id', { document_expires_at: '2026-12-02' }),
];
const dossier = (d: Partial<KycDossier>): KycDossier => ({
  id: 1,
  subject_type: 'App\\Models\\Agency',
  subject_id: 1,
  status: 'pending',
  submitted_at: null,
  reviewed_at: null,
  reviewed_by: null,
  rejection_reason: null,
  metadata: {},
  documents: [],
  expires_at: null,
  created_at: '2017-11-02T09:00:00Z',
  updated_at: null,
  ...d,
});

function monter(d: KycDossier, numeros: Partial<Record<'rccm' | 'ninea', string | null>> = {}) {
  kyc.fetchAgencyKyc.mockResolvedValue({ data: d });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <VerificationDeLAgence agencyId={1} numeros={numeros} maintenant={AUJOURDHUI} />
      </QueryClientProvider>,
    ),
  );
}

const fichier = (nom = 'cni.jpg', octets = 1024) => {
  const f = new File(['x'], nom, { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: octets });
  return f;
};
/** Les deux champs fichier masqués de l'envoi le plus proche du bouton visible. */
const champFichier = (bouton: HTMLElement) => bouton.closest('div.grid')!.parentElement!.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];

/** AC2 — chaque bouton désactivé a une raison VISIBLE. */
function chaqueBoutonDesactiveDitPourquoi() {
  for (const b of screen.queryAllByRole('button')) {
    if (!(b as HTMLButtonElement).disabled) continue;
    const ids = b.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids.length, `bouton désactivé sans raison : ${b.textContent}`).toBeGreaterThan(0);
    for (const id of ids) {
      const raison = document.getElementById(id);
      expect(raison, `raison introuvable : ${id}`).not.toBeNull();
      expect(raison!.textContent!.trim()).not.toBe('');
      expect(raison!.closest('.sr-only, [hidden]')).toBeNull();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  kyc.uploadAgencyKycDocument.mockResolvedValue({ data: dossier({ status: 'submitted' }) });
  kyc.submitAgencyKyc.mockResolvedValue({ data: dossier({ status: 'submitted' }) });
});

describe('AC1 — renouveler la pièce du dirigeant d’un dossier vérifié', () => {
  const VERIFIE_20_JOURS = dossier({
    status: 'verified',
    documents: TROIS,
    expires_at: '2026-12-02T00:00:00Z',
    renewal: { document_type: 'director_id', opens_on: '2026-11-02' },
    reviewed_at: '2017-11-09T09:00:00Z',
  });

  it('à 20 jours de l’échéance, l’envoi est offert, actif, et part avec la date (201 = succès)', async () => {
    const user = userEvent.setup();
    monter(VERIFIE_20_JOURS);
    const remplacer = await screen.findByRole('button', { name: V.actions.remplacerPieceIdentite });
    expect(remplacer).toBeEnabled();
    expect(screen.getByRole('heading', { name: /La pièce du dirigeant expire le/ })).toBeInTheDocument();

    fireEvent.change(champFichier(screen.getByRole('button', { name: /Choisir un fichier : Pièce du dirigeant/ })), {
      target: { files: [fichier()] },
    });
    fireEvent.change(screen.getByLabelText(/^Date d.expiration : Pièce du dirigeant$/), { target: { value: '2031-05-01' } });
    await user.click(remplacer);

    await waitFor(() => expect(kyc.uploadAgencyKycDocument).toHaveBeenCalledTimes(1));
    expect(kyc.uploadAgencyKycDocument).toHaveBeenCalledWith(1, 'director_id', expect.any(File), '2031-05-01', undefined);
    await waitFor(() => expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: V.envoi.reussiExamen })));
    chaqueBoutonDesactiveDitPourquoi();
  });

  it('loin de l’échéance, le dossier vérifié n’offre aucun remplacement (verrou de l’API)', async () => {
    monter(
      dossier({
        status: 'verified',
        documents: TROIS,
        expires_at: '2027-06-01T00:00:00Z',
        renewal: { document_type: 'director_id', opens_on: '2027-05-02' },
      }),
    );
    expect(await screen.findByRole('heading', { name: V.etat.verifiee.titre })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: V.actions.remplacerPieceIdentite })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remplacer la pièce : / })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /Choisir un fichier/ })).toHaveLength(0);
  });

  it('sans fichier, l’envoi se refuse au clic et dit pourquoi, sans appel', async () => {
    const user = userEvent.setup();
    monter(VERIFIE_20_JOURS);
    const remplacer = await screen.findByRole('button', { name: V.actions.remplacerPieceIdentite });
    await user.click(remplacer);
    expect(screen.getByRole('alert')).toHaveTextContent(V.envoi.fichierManquant);
    expect(remplacer).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
    fireEvent.change(champFichier(screen.getByRole('button', { name: /Choisir un fichier : Pièce du dirigeant/ })), {
      target: { files: [fichier()] },
    });
    await user.click(remplacer);
    expect(screen.getByRole('alert')).toHaveTextContent(V.envoi.dateManquante);
    expect(kyc.uploadAgencyKycDocument).not.toHaveBeenCalled();
  });

  it('un fichier de plus de 10 Mo est refusé au choix', async () => {
    monter(VERIFIE_20_JOURS);
    await screen.findByRole('button', { name: V.actions.remplacerPieceIdentite });
    fireEvent.change(champFichier(screen.getByRole('button', { name: /Choisir un fichier : Pièce du dirigeant/ })), {
      target: { files: [fichier('cni.jpg', 11 * 1024 * 1024)] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Ce fichier dépasse 10 Mo');
  });
});

describe('les états du dossier', () => {
  it('la démo : repassé en attente par l’échéance, la pièce échue — la conséquence est dite', async () => {
    monter(
      dossier({
        metadata: { expired_at: '2026-11-11T06:00:03+00:00' },
        documents: [TROIS[0], TROIS[1], piece('director_id', { document_expires_at: '2021-04-26' })],
      }),
    );
    expect(await screen.findByRole('heading', { name: V.etat.a_renouveler.titre })).toBeInTheDocument();
    expect(screen.getByText('vos reversements Takussan sont suspendus')).toBeInTheDocument();
    expect(screen.getByText('Expirée le 26 avr. 2021')).toBeInTheDocument();
    expect(screen.getByText(V.statut.a_renouveler)).toBeInTheDocument();
    // Le numéro de la pièce et son nom ; et la note des mentions légales.
    expect(screen.getByText('SN-DKR-2017-B-8841 · rccm.pdf')).toBeInTheDocument();
    expect(screen.getAllByText(V.pieces.noteFournie)).toHaveLength(2);
    chaqueBoutonDesactiveDitPourquoi();
  });

  it('à fournir : les pièces manquantes s’ouvrent, et « Soumettre » désactivé dit ce qui manque (AC2)', async () => {
    monter(dossier({ documents: [TROIS[0]] }), { ninea: '005 123 456' });
    expect(await screen.findByRole('heading', { name: V.etat.a_fournir.titre })).toBeInTheDocument();
    const soumettre = screen.getByRole('button', { name: V.actions.soumettre });
    expect(soumettre).toBeDisabled();
    expect(document.getElementById(soumettre.getAttribute('aria-describedby')!)).toHaveTextContent('Ajoutez d’abord : NINEA et Pièce du dirigeant.');
    // Le NINEA des mentions légales préremplit le numéro de la pièce.
    expect(screen.getByLabelText(V.numero.ninea)).toHaveValue('005 123 456');
    chaqueBoutonDesactiveDitPourquoi();
  });

  it('le numéro saisi part avec la pièce', async () => {
    const user = userEvent.setup();
    monter(dossier({ documents: [] }));
    await screen.findByRole('heading', { name: V.etat.a_fournir.titre });
    await user.type(screen.getByLabelText(V.numero.rccm), 'SN-DKR-2017-B-8841');
    fireEvent.change(champFichier(screen.getByRole('button', { name: /Choisir un fichier : RCCM/ })), { target: { files: [fichier('rccm.pdf')] } });
    const ligne = document.getElementById(screen.getByLabelText(V.numero.rccm).closest('[id$="-rccm"]')!.id)!;
    await user.click(within(ligne).getByRole('button', { name: V.actions.envoyerPiece }));
    await waitFor(() => expect(kyc.uploadAgencyKycDocument).toHaveBeenCalledWith(1, 'rccm', expect.any(File), undefined, 'SN-DKR-2017-B-8841'));
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: V.envoi.reussi }));
  });

  it('prêt : « Soumettre le dossier » est actif et soumet', async () => {
    const user = userEvent.setup();
    monter(dossier({ documents: [TROIS[0], TROIS[1], piece('director_id', { document_expires_at: '2031-01-01' })] }));
    await user.click(await screen.findByRole('button', { name: V.actions.soumettre }));
    await waitFor(() => expect(kyc.submitAgencyKyc).toHaveBeenCalledWith(1));
  });

  it('refusée : le motif d’abord ; « Corriger » ouvre l’envoi de chaque pièce', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    monter(dossier({ status: 'rejected', rejection_reason: 'RCCM illisible', documents: TROIS }));
    expect(await screen.findByRole('heading', { name: V.etat.refusee.titre })).toBeInTheDocument();
    expect(screen.getByText('« RCCM illisible »')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: V.actions.envoyerPiece })).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: V.actions.corriger }));
    expect(screen.getAllByRole('button', { name: V.actions.envoyerPiece })).toHaveLength(3);
    expect(screen.getByRole('button', { name: V.actions.renvoyer })).toBeEnabled();
  });

  it('en examen : la date d’envoi, et aucune pièce à remplacer', async () => {
    monter(dossier({ status: 'submitted', submitted_at: '2026-11-10T09:00:00Z', documents: TROIS }));
    expect(await screen.findByText('Envoyé le 10 nov. 2026. La décision vous parvient par e-mail et dans vos notifications.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Remplacer|Envoyer la pièce|Choisir un fichier/ })).toHaveLength(0);
  });

  it('un dossier illisible : l’erreur et « Réessayer », jamais un dossier vide', async () => {
    kyc.fetchAgencyKyc.mockRejectedValue(new Error('500'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <VerificationDeLAgence agencyId={1} maintenant={AUJOURDHUI} />
        </QueryClientProvider>,
      ),
    );
    expect(await screen.findByText(V.chargement)).toBeInTheDocument();
    expect(screen.queryByText(V.etat.a_fournir.titre)).toBeNull();
  });
});

describe('AC6 — « Prendre en photo » et « Choisir un fichier »', () => {
  it('côte à côte (grille de deux), de 44 px au moins (`min-h-11`), libellé qui passe à la ligne plutôt que tronqué (360 px), et la caméra arrière pour la photo', async () => {
    monter(dossier({ documents: [] }));
    const photo = await screen.findByRole('button', { name: 'Prendre en photo : RCCM' });
    const choisir = screen.getByRole('button', { name: 'Choisir un fichier : RCCM' });
    expect(photo.parentElement).toBe(choisir.parentElement);
    expect(photo.parentElement).toHaveClass('grid', 'grid-cols-2');
    expect(photo).toHaveClass('min-h-11', 'min-w-0', 'whitespace-normal');
    // Relevé du 2026-11-12 : à 360 px chaque bouton mesure 143 px et « Prendre en photo » était tronqué.
    for (const b of [photo, choisir]) expect(b.querySelector('span')).not.toHaveClass('truncate');
    const champs = photo.parentElement!.parentElement!.querySelectorAll('input[type="file"]');
    expect(champs[0]).toHaveAttribute('capture', 'environment');
    // Les images que l'API admet, HEIC compris — jamais `image/*`.
    expect(champs[0].getAttribute('accept')!.split(',')).toEqual(KYC_MIME_ACCEPT.split(',').filter((m) => m.startsWith('image/')));
    expect(champs[0].getAttribute('accept')).toContain('image/heic');
  });
});

/**
 * Portés de `KycDocumentUploader` (supprimé) : TCK-2150 (taille, types), TCK-601 (échéance de la
 * pièce du dirigeant), TCK-1519 (le lien d'une pièce vise le relais du front).
 */
describe('portés de l’ancien envoi des pièces', () => {
  it('TCK-2150 — 10 Mo exactement est retenu, sans alerte ; le sélecteur propose ce que l’API admet (HEIC compris)', async () => {
    monter(dossier({ documents: [] }));
    const choisir = await screen.findByRole('button', { name: 'Choisir un fichier : RCCM' });
    const champ = champFichier(choisir);
    expect(champ).toHaveAttribute('accept', KYC_MIME_ACCEPT);
    fireEvent.change(champ, { target: { files: [fichier('rccm.pdf', 10 * 1024 * 1024)] } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('rccm.pdf')).toBeInTheDocument();
  });

  it('TCK-601 — seule la pièce du dirigeant demande une échéance, au plus tôt demain (jour de l’API)', async () => {
    monter(dossier({ documents: [] }));
    await screen.findByRole('button', { name: 'Choisir un fichier : RCCM' });
    const dates = screen.getAllByLabelText(/^Date d.expiration : /);
    expect(dates).toHaveLength(1);
    expect(dates[0]).toHaveAccessibleName(/Pièce du dirigeant$/);
    expect(dates[0]).toHaveAttribute('min', demainIso());
  });

  it('TCK-601 — une pièce du dirigeant proche de son échéance le dit', async () => {
    monter(dossier({ documents: [TROIS[0], TROIS[1], piece('director_id', { document_expires_at: '2026-11-20' })] }));
    expect(await screen.findByText(fr.kyc.expiry.soonBadge)).toBeInTheDocument();
    expect(screen.getByText('Valable jusqu’au 20 nov. 2026')).toBeInTheDocument();
  });

  it('TCK-1519 — « Voir » mène au relais du front (lienPieceKyc), pas à l’API', async () => {
    monter(dossier({ documents: [piece('rccm', { signed_url: 'https://api.test/api/kyc/documents/7?expires=1&signature=abc' })] }));
    const voir = await screen.findByRole('link', { name: 'Voir la pièce : RCCM' });
    expect(voir.getAttribute('href')).toBe('/api/kyc/documents/7?expires=1&signature=abc');
  });
});
