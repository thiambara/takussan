/**
 * TCK-2656 (lot 2) — l'ajout au coffre en deux temps :
 *
 * - « Prendre une photo » ouvre l'appareil (`capture="environment"`), « Choisir un fichier » les types
 *   acceptés ; un fichier de plus de 10 Mo est refusé avant tout envoi ;
 * - « Rangé dans » se choisit parmi les cibles que l'API rend, et AUCUN champ d'identifiant n'est rendu :
 *   le dossier choisi est celui que la requête porte ;
 * - « À renouveler » mène à la fiche de la pièce, qui porte le remplacement ;
 * - dès `md`, la modale centrée et son dépôt par glisser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import { voirLeCoffre, type CoffreDeDocuments } from '@/lib/documents/coffre';

const ecran = { bureau: false };
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.bureau }));

const envoi = vi.fn();
vi.mock('@/lib/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/documents')>('@/lib/queries/documents');
  return { ...actual, useUploadDocument: () => ({ mutateAsync: envoi, isPending: false }) };
});

import { AjoutAuCoffre } from '../AjoutAuCoffre';

const AUJOURDHUI = '2026-11-13';

/** Un bailleur : ses pièces, un bien loué (le bien et son bail se rangent dans le même dossier). */
const COFFRE: CoffreDeDocuments = {
  folders: [
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
          category: 'insurance',
          title: 'Assurance habitation',
          date: '2026-01-10',
          download_path: '/api/documents/301',
          targets: [{ type: 'user', id: 78 }],
          document_id: 301,
          is_verified: true,
          expiry_date: '2026-11-23',
          versions_count: 0,
        },
      ],
    },
    {
      key: 'property:5',
      kind: 'property',
      target: { type: 'property', id: 5 },
      name: 'Villa aux Almadies',
      year: null,
      read_only: false,
      entries: [],
    },
  ],
  counts: { expiring_soon: 1, unverified: 0 },
  attachable_targets: [
    { type: 'user', id: 78, folder: 'pieces', name: null },
    { type: 'property', id: 5, folder: 'property:5', name: 'Villa aux Almadies' },
    { type: 'lease', id: 30, folder: 'property:5', name: 'Villa aux Almadies', reference: 'LS-0DPA75TK' },
  ],
};

const onOpenChange = vi.fn();
const onAjoute = vi.fn();

function rendre(coffre: CoffreDeDocuments = COFFRE) {
  return render(
    withIntl(<AjoutAuCoffre open onOpenChange={onOpenChange} coffre={coffre} vu={voirLeCoffre(coffre, AUJOURDHUI)} onAjoute={onAjoute} />),
  );
}

const fichier = (nom: string, type: string, taille = 2048) => {
  const f = new File(['x'], nom, { type });
  Object.defineProperty(f, 'size', { value: taille });
  return f;
};

const entreePhoto = () => document.querySelector<HTMLInputElement>('input[type="file"][capture]')!;
const entreeFichier = () => document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;

beforeEach(() => {
  ecran.bureau = false;
  envoi.mockReset().mockResolvedValue({ data: { id: 900 } });
  onOpenChange.mockReset();
  onAjoute.mockReset();
});

describe('TCK-2656 — l’ajout au coffre, au téléphone', () => {
  it('propose la photo par l’appareil et le fichier, puis « À renouveler » vers la fiche de la pièce', () => {
    rendre();
    expect(screen.getByText('Prendre une photo')).toBeInTheDocument();
    expect(screen.getByText('Choisir un fichier')).toBeInTheDocument();
    expect(entreePhoto()).toHaveAttribute('capture', 'environment');
    expect(entreePhoto()).toHaveAttribute('accept', 'image/*');
    expect(entreeFichier().getAttribute('accept')).toContain('application/pdf');

    const renouveler = screen.getByRole('region', { name: 'À renouveler' });
    expect(within(renouveler).getByText('Assurance habitation')).toBeInTheDocument();
    expect(within(renouveler).getByText('expire dans 10 jours')).toBeInTheDocument();
    expect(within(renouveler).getByRole('link', { name: 'Remplacer' })).toHaveAttribute('href', '/app/documents/301');
    expect(screen.getByText(/rangé dans « Mes pièces »/)).toBeInTheDocument();
  });

  it('refuse un fichier de plus de 10 Mo sans quitter le choix', () => {
    rendre();
    fireEvent.change(entreeFichier(), { target: { files: [fichier('bail.pdf', 'application/pdf', 11 * 1024 * 1024)] } });
    expect(screen.getByRole('alert')).toHaveTextContent('dépasse 10 Mo');
    expect(screen.queryByTestId('fichier-choisi')).not.toBeInTheDocument();
    expect(screen.getByText('Prendre une photo')).toBeInTheDocument();
  });

  it('range dans le dossier choisi, sans jamais rendre de champ d’identifiant', async () => {
    rendre();
    fireEvent.change(entreeFichier(), { target: { files: [fichier('Etat des lieux.pdf', 'application/pdf')] } });

    expect(screen.getByTestId('fichier-choisi')).toHaveTextContent('Etat des lieux.pdf');
    expect(screen.getByLabelText('Nom')).toHaveValue('Etat des lieux');
    expect(document.querySelector('input[type="number"]')).toBeNull();
    expect(document.querySelector('[name="documentable_id"], [name="documentable_type"]')).toBeNull();
    expect(screen.getByTestId('range-dans')).toHaveTextContent('Mes pièces');

    fireEvent.click(screen.getByRole('button', { name: 'Changer le dossier de rangement' }));
    const choix = screen.getByRole('radiogroup', { name: 'Rangé dans' });
    expect(within(choix).getAllByRole('radio')).toHaveLength(3);
    // Un clic de pointeur (detail 1) choisit et referme la liste.
    fireEvent.click(within(choix).getByRole('radio', { name: /Le bail LS-0DPA75TK de ce bien/ }), { detail: 1 });
    expect(screen.getByTestId('range-dans')).toHaveTextContent('Villa aux Almadies');

    fireEvent.click(screen.getByRole('button', { name: 'Passeport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));

    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1));
    expect(envoi.mock.calls[0][0]).toMatchObject({
      name: 'Etat des lieux',
      type: 'passport',
      documentable_type: 'lease',
      documentable_id: 30,
    });
    expect(envoi.mock.calls[0][0].file.name).toBe('Etat des lieux.pdf');
    await waitFor(() => expect(onAjoute).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('une photo ne préremplit pas le nom et se reprend ; sans nom, rien ne part', async () => {
    rendre();
    fireEvent.change(entreePhoto(), { target: { files: [fichier('IMG_2041.jpg', 'image/jpeg')] } });

    expect(screen.getByLabelText('Nom')).toHaveValue('');
    expect(screen.getByText('Reprendre')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
    await waitFor(() => expect(screen.getByLabelText('Nom')).toHaveAttribute('aria-invalid', 'true'));
    expect(envoi).not.toHaveBeenCalled();
  });

  it('« Plus de catégories » ouvre la liste entière', () => {
    rendre();
    fireEvent.change(entreeFichier(), { target: { files: [fichier('note.pdf', 'application/pdf')] } });
    expect(screen.queryByRole('combobox', { name: 'Plus de catégories' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Plus de catégories' }));
    expect(screen.getByRole('combobox', { name: 'Plus de catégories' })).toBeInTheDocument();
  });
});

describe('TCK-2656 — l’ajout au coffre, au clavier', () => {
  it('les tuiles sont des boutons qui ouvrent l’appareil ou le sélecteur de fichiers', () => {
    const clic = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /Prendre une photo/ }));
    expect(clic.mock.contexts.at(-1)).toBe(entreePhoto());
    fireEvent.click(screen.getByRole('button', { name: /Choisir un fichier/ }));
    expect(clic.mock.contexts.at(-1)).toBe(entreeFichier());
    clic.mockRestore();
  });

  it('« Changer » porte le focus sur le dossier coché ; les flèches choisissent sans refermer ; Entrée rend « Changer »', async () => {
    rendre();
    fireEvent.change(entreeFichier(), { target: { files: [fichier('note.pdf', 'application/pdf')] } });
    // Le panneau pose d'abord son focus initial (« Fermer ») : l'utilisateur agit après.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus());
    const changer = screen.getByRole('button', { name: 'Changer le dossier de rangement' });
    fireEvent.click(changer);

    const choix = screen.getByRole('radiogroup', { name: 'Rangé dans' });
    await waitFor(() => expect(within(choix).getByRole('radio', { name: /Mes pièces/ })).toHaveFocus());
    // Ce que synthétise une flèche : un clic sans détail de pointeur.
    const bien = within(choix).getByRole('radio', { name: /Le bien/ });
    fireEvent.click(bien, { detail: 0 });
    expect(bien).toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'Rangé dans' })).toBeInTheDocument();

    fireEvent.keyDown(bien, { key: 'Enter' });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Changer le dossier de rangement' })).toHaveFocus());
    expect(screen.getByTestId('range-dans')).toHaveTextContent('Villa aux Almadies');

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Plan du bien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1));
    expect(envoi.mock.calls[0][0]).toMatchObject({ documentable_type: 'property', documentable_id: 5 });
  });

  it('la taille se dit en Ko sous 1 Mo, en Mo au-delà', () => {
    rendre();
    fireEvent.change(entreeFichier(), { target: { files: [fichier('petit.pdf', 'application/pdf', 2048)] } });
    expect(screen.getByTestId('fichier-choisi')).toHaveTextContent('PDF · 2 Ko sur 10 Mo');
    fireEvent.change(entreeFichier(), { target: { files: [fichier('gros.pdf', 'application/pdf', Math.round(2.4 * 1024 * 1024))] } });
    expect(screen.getByTestId('fichier-choisi')).toHaveTextContent('PDF · 2,4 Mo sur 10 Mo');
  });
});

describe('TCK-2656 — l’ajout au coffre, au bureau', () => {
  it('une modale d’un seul tenant : dépôt, puis le fichier et ses champs, rangé par défaut dans « Mes pièces »', async () => {
    ecran.bureau = true;
    rendre();
    const depot = screen.getByTestId('depot');
    expect(depot).toHaveTextContent('Déposez un fichier ici');
    expect(within(depot).getByRole('button', { name: 'Parcourir' })).toBeInTheDocument();
    expect(screen.queryByText('Prendre une photo')).not.toBeInTheDocument();

    fireEvent.drop(depot, { dataTransfer: { files: [fichier('Quittance.pdf', 'application/pdf')] } });
    expect(screen.getByTestId('fichier-choisi')).toHaveTextContent('Quittance.pdf');
    expect(screen.getByRole('button', { name: 'Changer de fichier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1));
    expect(envoi.mock.calls[0][0]).toMatchObject({ name: 'Quittance', type: 'other', documentable_type: 'user', documentable_id: 78 });
  });
});
