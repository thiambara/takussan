/**
 * TCK-2898 — l'ajout au coffre :
 *
 * - AC1 / AC2 / AC3 : « Remplace la carte qui expire » — activé, le fichier part en NOUVELLE VERSION de
 *   la pièce qui expire (`POST /api/documents/{id}/versions`) ; désactivé, un document neuf
 *   (`POST /api/documents`) ; sans pièce du même genre qui expire, l'interrupteur n'est pas rendu ;
 * - AC4 : après la prise, la photo se tourne d'un quart de tour et un coin se déplace ; le fichier
 *   envoyé est l'image dessinée aux dimensions du cadre choisi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import { voirLeCoffre, type CoffreDeDocuments } from '@/lib/documents/coffre';

const ecran = { bureau: false };
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.bureau }));

const envoi = vi.fn();
const versionner = vi.fn();
vi.mock('@/lib/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/documents')>('@/lib/queries/documents');
  return {
    ...actual,
    useUploadDocument: () => ({ mutateAsync: envoi, isPending: false }),
    useUploadDocumentVersion: () => ({ mutateAsync: versionner, isPending: false }),
  };
});

import { AjoutAuCoffre } from '../AjoutAuCoffre';

const AUJOURDHUI = '2026-11-15';

/** Une locataire dont la carte d'identité (document 41) expire dans 42 jours. */
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
          category: 'id_card',
          title: 'Carte d’identité',
          date: '2026-06-28',
          download_path: '/api/documents/41',
          targets: [{ type: 'user', id: 78 }],
          document_id: 41,
          is_verified: true,
          expiry_date: '2026-12-27',
          versions_count: 1,
        },
      ],
    },
  ],
  counts: { expiring_soon: 1, unverified: 0 },
  attachable_targets: [{ type: 'user', id: 78, folder: 'pieces', name: null }],
};

const rendre = (coffre: CoffreDeDocuments = COFFRE) =>
  render(withIntl(<AjoutAuCoffre open onOpenChange={vi.fn()} coffre={coffre} vu={voirLeCoffre(coffre, AUJOURDHUI)} />));
const photo = () => new File(['x'], 'IMG_2041.jpg', { type: 'image/jpeg' });
const prendre = (f: File) => fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"][capture]')!, { target: { files: [f] } });
const interrupteur = () => screen.queryByRole('switch', { name: 'Remplace la carte qui expire' });

beforeEach(() => {
  ecran.bureau = false;
  envoi.mockReset().mockResolvedValue({ data: { id: 900 } });
  versionner.mockReset().mockResolvedValue({ data: { id: 5 } });
});

describe('TCK-2898 — « Remplace la carte qui expire »', () => {
  it('AC1 — activé par défaut : la nouvelle photo part en version de la carte qui expire, jamais en document neuf', async () => {
    rendre();
    prendre(photo());
    fireEvent.click(screen.getByRole('button', { name: "Pièce d'identité" }));

    expect(interrupteur()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('remplace')).toHaveTextContent('L’ancienne reste dans les versions.');
    // Le nom obligatoire se préremplit de celui de la pièce remplacée.
    expect(screen.getByLabelText('Nom')).toHaveValue('Carte d’identité');

    fireEvent.change(screen.getByLabelText(/Précision/), { target: { value: 'Nouvelle carte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
    await waitFor(() => expect(versionner).toHaveBeenCalledTimes(1));
    expect(versionner.mock.calls[0][0]).toMatchObject({ document_id: 41, comment: 'Nouvelle carte' });
    expect(versionner.mock.calls[0][0].file).toBeInstanceOf(File);
    expect(envoi).not.toHaveBeenCalled();
  });

  it('AC2 — désactivé : un document neuf, comme avant', async () => {
    rendre();
    prendre(photo());
    fireEvent.click(screen.getByRole('button', { name: "Pièce d'identité" }));
    fireEvent.click(interrupteur()!);
    expect(interrupteur()).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1));
    expect(envoi.mock.calls[0][0]).toMatchObject({ type: 'id_card', documentable_type: 'user', documentable_id: 78 });
    expect(versionner).not.toHaveBeenCalled();
  });

  it('AC3 — sans pièce du même genre qui expire, l’interrupteur n’est pas rendu', () => {
    rendre();
    prendre(photo());
    // « Autre » à l'ouverture : aucune pièce « Autre » n'expire.
    expect(screen.queryByTestId('remplace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Passeport' }));
    expect(screen.queryByTestId('remplace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Pièce d'identité" }));
    expect(screen.getByTestId('remplace')).toBeInTheDocument();
  });

  it('AC3 — une carte qui expire au-delà de 60 jours ne se propose pas', () => {
    const loin: CoffreDeDocuments = {
      ...COFFRE,
      folders: [{ ...COFFRE.folders[0], entries: [{ ...COFFRE.folders[0].entries[0], expiry_date: '2027-06-01' }] }],
    };
    rendre(loin);
    prendre(photo());
    fireEvent.click(screen.getByRole('button', { name: "Pièce d'identité" }));
    expect(screen.queryByTestId('remplace')).not.toBeInTheDocument();
  });
});

describe('TCK-2898 — AC4 : redresser et recadrer la photo', () => {
  const dessins: { largeur: number; hauteur: number; rotations: number[] }[] = [];
  const restaurer: (() => void)[] = [];

  beforeEach(() => {
    dessins.length = 0;
    // Le navigateur décode la photo : 1000 × 600 (paysage).
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1000, height: 600, close: vi.fn() })));
    const getContext = HTMLCanvasElement.prototype.getContext;
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      const rotations: number[] = [];
      return {
        translate: vi.fn(),
        rotate: (a: number) => rotations.push(a),
        drawImage: () => dessins.push({ largeur: this.width, hauteur: this.height, rotations }),
      } as unknown as CanvasRenderingContext2D;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = function (rappel: BlobCallback, type?: string) {
      rappel(new Blob(['recadree'], { type }));
    };
    restaurer.push(() => {
      HTMLCanvasElement.prototype.getContext = getContext;
      HTMLCanvasElement.prototype.toBlob = toBlob;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restaurer.splice(0).forEach((r) => r());
  });

  it('un quart de tour, un coin déplacé : le fichier envoyé a les dimensions du cadre choisi', async () => {
    rendre();
    const originale = photo();
    prendre(originale);

    // L'étape de recadrage, entre la prise et le formulaire.
    expect(await screen.findByRole('heading', { name: 'Redresser et recadrer' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tourner' }));
    const coin = screen.getByRole('button', { name: 'Coin en haut à gauche' });
    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(coin, { key: 'ArrowRight' });
      fireEvent.keyDown(coin, { key: 'ArrowDown' });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser cette photo' }));

    // Le formulaire, avec la photo recadrée.
    expect(await screen.findByText('Photo recadrée')).toBeInTheDocument();
    // Tournée : 600 × 1000 ; le coin à 10 % de chaque côté → 540 × 900.
    expect(dessins).toEqual([{ largeur: 540, hauteur: 900, rotations: [Math.PI / 2] }]);

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Attestation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1));
    const envoye = envoi.mock.calls[0][0].file as File;
    expect(envoye).not.toBe(originale);
    expect(envoye.type).toBe('image/jpeg');
    expect(envoye.name).toBe('IMG_2041.jpg');
    expect(await envoye.text()).toBe('recadree');
  });

  it('sans rien changer, la photo d’origine part telle quelle, sans être redessinée', async () => {
    rendre();
    const originale = photo();
    prendre(originale);
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser cette photo' }));
    expect(await screen.findByText('IMG_2041.jpg')).toBeInTheDocument();
    expect(dessins).toEqual([]);

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Attestation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1));
    expect(envoi.mock.calls[0][0].file).toBe(originale);
  });

  it('au bureau, la même étape dans la modale ; « Annuler » revient au dépôt sans fichier', async () => {
    ecran.bureau = true;
    rendre();
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!, { target: { files: [photo()] } });
    expect(await screen.findByRole('button', { name: 'Coin en bas à droite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Utiliser cette photo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByTestId('depot')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Utiliser cette photo' })).not.toBeInTheDocument();
  });
});
