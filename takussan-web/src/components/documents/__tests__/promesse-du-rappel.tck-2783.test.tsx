/**
 * TCK-2783 (AC6) — « Nous vous préviendrons 60 jours avant » revient à l'écran maintenant que le rappel
 * d'expiration existe (`documents:remind-expiring`), et seulement là où il est vrai pour ce lecteur :
 * une pièce de « Mes pièces » (portée par son compte) — sur sa fiche, et dans l'ajout au coffre, sous
 * l'expiration. Elle dit le prochain rappel : « 60 jours avant » au-delà de 60 jours, « 7 jours avant »
 * entre 8 et 60 jours, rien à 7 jours ou moins (décision de la session du 2026-11-14).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller, type Control, type FieldValues, type FieldPath } from 'react-hook-form';

import { voirLeCoffre, type CoffreDeDocuments } from '@/lib/documents/coffre';
import { withIntl } from '@/test/intl';
import type { DocumentWithVersions } from '@/types/document';

const etat = vi.hoisted(() => ({ document: null as unknown as DocumentWithVersions }));

vi.mock('@/lib/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/documents')>('@/lib/queries/documents');
  return {
    ...actual,
    useDocumentWithVersions: () => ({ data: { data: etat.document }, isLoading: false, isError: false, refetch: () => undefined }),
    useShareLinks: () => ({ data: { data: [] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() }),
    useCreateShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useRevokeShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 11 } }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => false }));
vi.mock('@/components/documents/fiche/VersionsDuDocument', () => ({ VersionsDuDocument: () => null }));
// Le sélecteur de date : un champ texte, pour saisir la date sans piloter le calendrier.
vi.mock('@/components/forms/FormDatePicker', () => ({
  FormDatePicker: <T extends FieldValues>({ control, name, label }: { control: Control<T>; name: FieldPath<T>; label?: string }) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <input aria-label={label} value={(field.value as string) ?? ''} onChange={(e) => field.onChange(e.target.value)} />}
    />
  ),
}));

import { DocumentDetailClient } from '../DocumentDetailClient';
import { AjoutAuCoffre } from '../coffre/ajout/AjoutAuCoffre';

const PROMESSE = 'Nous vous préviendrons 60 jours avant.';
const PROMESSE_SEPT = 'Nous vous préviendrons 7 jours avant.';
const aucunePromesse = () => {
  expect(screen.queryByText(PROMESSE)).not.toBeInTheDocument();
  expect(screen.queryByText(PROMESSE_SEPT)).not.toBeInTheDocument();
};

const piece = (champs: Partial<DocumentWithVersions>): DocumentWithVersions => ({
  id: 7,
  documentable_id: 11,
  documentable_type: 'App\\Models\\User',
  uploaded_by: 11,
  name: 'Carte d’identité',
  type: 'id_card',
  description: null,
  is_verified: false,
  verified_by: null,
  verified_at: null,
  expiry_date: '2027-06-01',
  file_url: null,
  file_name: 'cni.pdf',
  file_size: 1024,
  mime_type: 'application/pdf',
  created_at: '2026-06-28T10:00:00Z',
  active_version: null,
  versions: [],
  abilities: { update: true, share: false, delete: true },
  ...champs,
});

beforeEach(() => {
  // Aujourd'hui, à Dakar : le 13 novembre 2026. J-60 du 12 janvier 2027 tombe le 13 novembre.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('TCK-2783 — la promesse sur la fiche d’une pièce', () => {
  const rendreLaFiche = (champs: Partial<DocumentWithVersions>) => {
    etat.document = piece(champs);
    return render(withIntl(<DocumentDetailClient documentId={7} />));
  };

  it('au-delà de 60 jours : « 60 jours avant »', () => {
    rendreLaFiche({ expiry_date: '2027-01-13' });
    expect(screen.getByText(PROMESSE)).toBeInTheDocument();
    expect(screen.queryByText(PROMESSE_SEPT)).not.toBeInTheDocument();
  });

  it.each([
    ['à 60 jours', '2027-01-12'],
    ['à 8 jours', '2026-11-21'],
  ])('entre 8 et 60 jours (%s) : « 7 jours avant »', (_cas, expiry_date) => {
    rendreLaFiche({ expiry_date });
    expect(screen.getByText(PROMESSE_SEPT)).toBeInTheDocument();
    expect(screen.queryByText(PROMESSE)).not.toBeInTheDocument();
  });

  it.each([
    ['à 7 jours de l’échéance', { expiry_date: '2026-11-20' }],
    ['qui expire aujourd’hui', { expiry_date: '2026-11-13' }],
    ['sans date', { expiry_date: null }],
    ['déjà expirée', { expiry_date: '2026-10-01' }],
    ['portée par un autre compte', { documentable_id: 12 }],
    ['d’une fiche client, même téléversée par le lecteur', { documentable_type: 'App\\Models\\Customer', documentable_id: 11 }],
    ['d’un bien', { documentable_type: 'App\\Models\\Property', documentable_id: 3 }],
  ])('ne s’affiche pas sur une pièce %s', (_cas, champs) => {
    rendreLaFiche(champs);
    aucunePromesse();
  });
});

describe('TCK-2783 — la promesse dans l’ajout au coffre', () => {
  const COFFRE: CoffreDeDocuments = {
    folders: [
      { key: 'pieces', kind: 'pieces', target: { type: 'user', id: 11 }, name: null, year: null, read_only: false, entries: [] },
      { key: 'property:5', kind: 'property', target: { type: 'property', id: 5 }, name: 'Villa aux Almadies', year: null, read_only: false, entries: [] },
    ],
    counts: { expiring_soon: 0, unverified: 0 },
    attachable_targets: [
      { type: 'user', id: 11, folder: 'pieces', name: null },
      { type: 'property', id: 5, folder: 'property:5', name: 'Villa aux Almadies' },
    ],
  };

  const ouvrirLesChamps = () => {
    render(withIntl(<AjoutAuCoffre open onOpenChange={vi.fn()} coffre={COFFRE} vu={voirLeCoffre(COFFRE, '2026-11-13')} />));
    const entree = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    fireEvent.change(entree, { target: { files: [new File(['x'], 'cni.pdf', { type: 'application/pdf' })] } });
  };
  const dater = (jour: string) => fireEvent.change(screen.getByLabelText('Expire le'), { target: { value: jour } });

  it('sous l’expiration d’une pièce de « Mes pièces » : 60 jours, puis 7 jours, puis rien', () => {
    ouvrirLesChamps();
    aucunePromesse();

    dater('2027-01-13');
    expect(screen.getByText(PROMESSE)).toBeInTheDocument();

    dater('2027-01-12');
    expect(screen.getByText(PROMESSE_SEPT)).toBeInTheDocument();
    expect(screen.queryByText(PROMESSE)).not.toBeInTheDocument();

    dater('2026-11-21');
    expect(screen.getByText(PROMESSE_SEPT)).toBeInTheDocument();

    dater('2026-11-20');
    aucunePromesse();
  });

  it('disparaît quand la pièce est rangée ailleurs que dans « Mes pièces »', () => {
    ouvrirLesChamps();
    dater('2027-06-01');
    expect(screen.getByText(PROMESSE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Changer le dossier de rangement' }));
    fireEvent.click(screen.getByRole('radio', { name: /Villa aux Almadies/ }), { detail: 1 });
    aucunePromesse();
  });
});
