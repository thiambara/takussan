/**
 * TCK-2899 — « Lu sur la photo » : l'ajout au coffre lit la date d'expiration sur la photo d'une carte
 * d'identité ou d'un passeport, dans le navigateur. Le moteur (`lib/documents/lecture-mrz/moteur`) est
 * doublé ici ; ses chemins et son chargement à la demande sont éprouvés par `moteur.tck-2899.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import { voirLeCoffre, type CoffreDeDocuments } from '@/lib/documents/coffre';

vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => false }));

const envoi = vi.fn();
vi.mock('@/lib/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/documents')>('@/lib/queries/documents');
  return { ...actual, useUploadDocument: () => ({ mutateAsync: envoi, isPending: false }) };
});

const lire = vi.fn<(fichier: Blob, signal?: AbortSignal) => Promise<string | null>>();
vi.mock('@/lib/documents/lecture-mrz/moteur', async () => {
  const actual = await vi.importActual<typeof import('@/lib/documents/lecture-mrz/moteur')>('@/lib/documents/lecture-mrz/moteur');
  return { ...actual, lireLaDateDExpiration: (fichier: Blob, signal?: AbortSignal) => lire(fichier, signal) };
});

// Le sélecteur de date : un champ texte, pour lire et saisir la date sans piloter le calendrier.
vi.mock('@/components/forms/FormDatePicker', () => ({
  FormDatePicker: <T extends FieldValues>({ control, name, label }: { control: Control<T>; name: FieldPath<T>; label?: string }) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <input aria-label={label} value={(field.value as string) ?? ''} onChange={(e) => field.onChange(e.target.value)} />}
    />
  ),
}));

import { AjoutAuCoffre } from '../AjoutAuCoffre';

const COFFRE: CoffreDeDocuments = {
  folders: [{ key: 'pieces', kind: 'pieces', target: { type: 'user', id: 11 }, name: null, year: null, read_only: false, entries: [] }],
  counts: { expiring_soon: 0, unverified: 0 },
  attachable_targets: [{ type: 'user', id: 11, folder: 'pieces', name: null }],
};

const rendre = () => render(withIntl(<AjoutAuCoffre open onOpenChange={vi.fn()} coffre={COFFRE} vu={voirLeCoffre(COFFRE, '2026-11-15')} />));
const photo = (nom = 'IMG_2041.jpg', type = 'image/jpeg') => new File(['x'], nom, { type });
const prendre = (f: File) => fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"][capture]')!, { target: { files: [f] } });
const choisirFichier = (f: File) => fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!, { target: { files: [f] } });
const expire = () => screen.getByLabelText('Expire le');
const categorie = (nom: string) => fireEvent.click(screen.getByRole('button', { name: nom }));

beforeEach(() => {
  envoi.mockReset().mockResolvedValue({ data: { id: 900 } });
  lire.mockReset();
});

describe('TCK-2899 — la date lue sur la photo', () => {
  it('AC2 — carte d’identité lisible : « Expire le » vaut la date lue, l’aide commence par « Lu sur la photo. »', async () => {
    lire.mockResolvedValue('2036-11-14');
    rendre();
    prendre(photo());
    categorie("Pièce d'identité");

    await waitFor(() => expect(expire()).toHaveValue('2036-11-14'));
    expect(lire).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('aide-de-l-expiration')).toHaveTextContent(/^Lu sur la photo\. Nous vous préviendrons 60 jours avant\.$/);
  });

  it('AC2 — la date se change, l’aide « Lu sur la photo » s’en va, et la date envoyée est celle du champ', async () => {
    lire.mockResolvedValue('2036-11-14');
    rendre();
    prendre(photo());
    categorie("Pièce d'identité");
    await waitFor(() => expect(expire()).toHaveValue('2036-11-14'));

    fireEvent.change(expire(), { target: { value: '2035-01-31' } });
    expect(screen.queryByText(/Lu sur la photo/)).not.toBeInTheDocument();
    expect(screen.getByTestId('aide-de-l-expiration')).toHaveTextContent('Nous vous préviendrons 60 jours avant.');

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Ma carte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1));
    expect(envoi.mock.calls[0][0]).toMatchObject({ type: 'id_card', expiry_date: '2035-01-31' });
  });

  it('le passeport aussi lance la lecture', async () => {
    lire.mockResolvedValue('2031-06-20');
    rendre();
    prendre(photo());
    categorie('Passeport');
    await waitFor(() => expect(expire()).toHaveValue('2031-06-20'));
  });

  it('rien lu : le champ reste vide, sans message — la seule promesse, sans « Lu sur la photo »', async () => {
    lire.mockResolvedValue(null);
    rendre();
    prendre(photo());
    categorie("Pièce d'identité");
    await waitFor(() => expect(lire).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(expire()).toHaveValue('');
    expect(screen.queryByText(/Lu sur la photo/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('une date saisie pendant la lecture n’est jamais écrasée', async () => {
    let rendreLaDate: (d: string | null) => void = () => undefined;
    lire.mockImplementation(() => new Promise((r) => (rendreLaDate = r)));
    rendre();
    prendre(photo());
    categorie("Pièce d'identité");
    await waitFor(() => expect(lire).toHaveBeenCalledTimes(1));
    fireEvent.change(expire(), { target: { value: '2030-02-01' } });
    await act(async () => rendreLaDate('2036-11-14'));
    expect(expire()).toHaveValue('2030-02-01');
    expect(screen.queryByText(/Lu sur la photo/)).not.toBeInTheDocument();
  });

  it('une photo reprise abandonne la lecture en cours : son résultat tardif est jeté', async () => {
    const signaux: AbortSignal[] = [];
    const rendus: Array<(d: string | null) => void> = [];
    lire.mockImplementation((_f, signal) => {
      signaux.push(signal!);
      return new Promise((r) => rendus.push(r));
    });
    rendre();
    prendre(photo('premiere.jpg'));
    categorie("Pièce d'identité");
    await waitFor(() => expect(lire).toHaveBeenCalledTimes(1));

    prendre(photo('seconde.jpg'));
    await waitFor(() => expect(lire).toHaveBeenCalledTimes(2));
    expect(signaux[0].aborted).toBe(true);
    await act(async () => rendus[0]('2036-11-14'));
    expect(expire()).toHaveValue('');
    await act(async () => rendus[1]('2031-06-20'));
    expect(expire()).toHaveValue('2031-06-20');
  });

  it('passer de « Pièce d’identité » à « Passeport » pendant la lecture ne la relance ni ne l’abandonne', async () => {
    const signaux: AbortSignal[] = [];
    let rendreLaDate: (d: string | null) => void = () => undefined;
    lire.mockImplementation((_f, signal) => {
      signaux.push(signal!);
      return new Promise((r) => (rendreLaDate = r));
    });
    rendre();
    prendre(photo());
    categorie("Pièce d'identité");
    await waitFor(() => expect(lire).toHaveBeenCalledTimes(1));
    categorie('Passeport');
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Mon passeport' } });
    await act(async () => undefined);
    expect(lire).toHaveBeenCalledTimes(1);
    expect(signaux[0].aborted).toBe(false);
    await act(async () => rendreLaDate('2031-06-20'));
    expect(expire()).toHaveValue('2031-06-20');
  });

  it('AC3 — une attestation de travail (« Autre » : le coffre n’a pas de catégorie à elle) ni aucune autre pièce ne lance la lecture', async () => {
    rendre();
    prendre(photo());
    // « Autre » est la catégorie cochée à l'ouverture.
    expect(screen.getByRole('button', { name: 'Autre' })).toHaveAttribute('aria-pressed', 'true');
    categorie('Assurance');
    await act(async () => undefined);
    expect(lire).not.toHaveBeenCalled();
  });

  it('un PDF de carte d’identité ne lance pas la lecture (seule une image se lit)', async () => {
    rendre();
    choisirFichier(new File(['x'], 'cni.pdf', { type: 'application/pdf' }));
    categorie("Pièce d'identité");
    await act(async () => undefined);
    expect(lire).not.toHaveBeenCalled();
  });
});
