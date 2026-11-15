/**
 * TCK-2759 (ADR-0099, amendement du 2026-11-12), AC11 — le document interne d'une fiche client, au
 * front :
 *
 * - la case « Visible par le client » du dialogue de dépôt, décochée par défaut : décochée, la requête
 *   porte `is_internal=1` ; cochée, `0` ; elle n'existe que pour le personnel, sur une fiche client ;
 * - la pastille « Interne » et la bascule, sur la fiche client et dans la bibliothèque, au seul verdict
 *   de l'API (`abilities.set_visibility`) — un client ne reçoit ni l'une ni l'autre ;
 * - « Rendre visible au client » se confirme, « Garder pour l'agence » non.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';

const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 1 } });
const basculer = vi.fn().mockResolvedValue({ data: { id: 9 } });
const configs: Array<{ path: unknown; method: string; body: (v: never) => unknown }> = [];

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: () => ({ data: undefined }),
  useApiMutation: (config: { path: unknown; method: string; body: (v: never) => unknown }) => {
    configs.push(config);
    return { mutateAsync: config.method === 'PATCH' ? basculer : mutateAsync, isPending: false, error: null };
  },
}));

const personnel = { actif: true };
vi.mock('@/hooks/usePersonnelActif', () => ({
  usePersonnelActif: () => personnel.actif,
  useAgenceDuPersonnelActif: () => (personnel.actif ? 3 : null),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { DocumentUploadDialog } from '../DocumentUploadDialog';
import { CustomerDocumentsPanel } from '@/components/customer-dashboard/CustomerDocumentsPanel';
import { useSetDocumentVisibility, useUploadDocument } from '@/lib/queries/documents';
import type { CustomerDocument } from '@/types/customer';

function deposer(cocher: boolean) {
  render(
    withIntl(
      <DocumentUploadDialog open onOpenChange={vi.fn()} defaultDocumentable={{ type: 'customer', id: 42 }} />,
    ),
  );
  fireEvent.change(document.getElementById('document-upload-input')!, {
    target: { files: [new File(['%PDF'], 'piece.pdf', { type: 'application/pdf' })] },
  });
  if (cocher) fireEvent.click(screen.getByRole('checkbox', { name: /Visible par le client/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }));
}

beforeEach(() => {
  mutateAsync.mockClear();
  basculer.mockClear();
  refresh.mockClear();
  personnel.actif = true;
});

describe('le dépôt sur une fiche client (AC11)', () => {
  it('la case est décochée par défaut, avec sa phrase d’aide ; décochée, la pièce part interne', async () => {
    deposer(false);
    const casse = screen.getByRole('checkbox', { name: /Visible par le client/ });
    expect(casse).not.toBeChecked();
    expect(screen.getByText('Sinon, seule l’agence la voit.')).toBeInTheDocument();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ documentable_type: 'customer', is_internal: true }));
  });

  it('cochée, la pièce part visible', async () => {
    deposer(true);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ is_internal: false }));
  });

  it('pour un client, ni case ni champ', async () => {
    personnel.actif = false;
    render(
      withIntl(
        <DocumentUploadDialog open onOpenChange={vi.fn()} defaultDocumentable={{ type: 'customer', id: 42 }} />,
      ),
    );
    expect(screen.queryByRole('checkbox', { name: /Visible par le client/ })).toBeNull();
    fireEvent.change(document.getElementById('document-upload-input')!, {
      target: { files: [new File(['%PDF'], 'piece.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0].is_internal).toBeUndefined();
  });

  it('hors d’une fiche client, pas de case, même pour le personnel', () => {
    render(
      withIntl(<DocumentUploadDialog open onOpenChange={vi.fn()} defaultDocumentable={{ type: 'lease', id: 7 }} />),
    );
    expect(screen.queryByRole('checkbox', { name: /Visible par le client/ })).toBeNull();
  });
});

describe('la requête réseau (AC11)', () => {
  it('le dépôt écrit is_internal en 1 ou 0 dans le formulaire, et rien sans la valeur', () => {
    configs.length = 0;
    useUploadDocument();
    const corps = configs.at(-1)!.body as (v: unknown) => FormData;
    const base = { file: new File(['x'], 'a.pdf'), name: 'a', type: 'other', documentable_type: 'customer', documentable_id: 42 };
    expect(corps({ ...base, is_internal: true }).get('is_internal')).toBe('1');
    expect(corps({ ...base, is_internal: false }).get('is_internal')).toBe('0');
    expect(corps(base).has('is_internal')).toBe(false);
  });

  it('la bascule est un PATCH sur /api/documents/{id}/visibility', () => {
    configs.length = 0;
    useSetDocumentVisibility();
    const config = configs.at(-1)!;
    expect(config.method).toBe('PATCH');
    expect((config.path as (v: { id: number }) => string)({ id: 9 })).toBe('/api/documents/9/visibility');
    expect((config.body as (v: unknown) => unknown)({ id: 9, is_internal: false })).toEqual({ is_internal: false });
  });
});

const interne: CustomerDocument = {
  id: 9, name: 'Note de solvabilité', type: 'other', created_at: '2026-11-12T10:00:00+00:00',
  is_internal: true, abilities: { set_visibility: true },
};
const visible: CustomerDocument = {
  id: 10, name: 'Bail signé', type: 'lease_contract', created_at: '2026-11-12T10:00:00+00:00',
  is_internal: false, abilities: { set_visibility: true },
};

describe('la fiche client : la pastille et la bascule (AC11)', () => {
  it('le personnel voit « Interne » et rend visible après confirmation', async () => {
    render(withIntl(<CustomerDocumentsPanel customerId={42} documents={[interne, visible]} />));
    const ligne = screen.getByText('Note de solvabilité').closest('li')!;
    expect(within(ligne).getByText('Interne')).toBeInTheDocument();
    expect(within(screen.getByText('Bail signé').closest('li')!).queryByText('Interne')).toBeNull();

    fireEvent.click(within(ligne).getByRole('button', { name: 'Rendre visible au client' }));
    expect(basculer).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Rendre visible' }));
    await waitFor(() => expect(basculer).toHaveBeenCalledWith({ id: 9, is_internal: false }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('« Garder pour l’agence » ne demande pas de confirmation', async () => {
    render(withIntl(<CustomerDocumentsPanel customerId={42} documents={[visible]} />));
    fireEvent.click(screen.getByRole('button', { name: 'Garder pour l’agence' }));
    await waitFor(() => expect(basculer).toHaveBeenCalledWith({ id: 10, is_internal: true }));
  });

  it('sans le verdict de l’API (un client), ni pastille ni bascule', () => {
    const duClient: CustomerDocument = { ...visible, abilities: { set_visibility: false } };
    render(withIntl(<CustomerDocumentsPanel customerId={42} documents={[duClient]} />));
    expect(screen.queryByText('Interne')).toBeNull();
    expect(screen.queryByRole('button', { name: /Rendre visible au client|Garder pour l’agence/ })).toBeNull();
    expect(screen.getByText('Ouvrir').closest('a')).toHaveAttribute('href', '/app/documents/10');
  });
});
