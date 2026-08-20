import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/fr.json';
import { PropertyForm } from '../PropertyForm';
import type { Tag } from '@/types/tag';

// ── Server actions ──────────────────────────────────────────────────────────

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  updatePropertyAction: vi.fn(),
  setPropertyAddressAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

// LocationPickerMapLoader is a dynamic import that touches Leaflet/window — stub it
vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="location-picker-map" />,
}));

import {
  createPropertyAction,
  setPropertyAddressAction,
  setPropertyTagsAction,
  uploadPropertyPhotosAction,
} from '@/app/actions/dashboard-properties';

// ── Helpers ─────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderForm(tags: Tag[] = []) {
  return render(<PropertyForm mode="create" tags={tags} />, { wrapper });
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/titre/i), 'Ma villa test');
  await user.clear(screen.getByLabelText(/prix/i));
  await user.type(screen.getByLabelText(/prix/i), '500000');
  await user.type(screen.getByLabelText(/ville/i), 'Dakar');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PropertyForm — creation mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createPropertyAction).mockResolvedValue({
      ok: true,
      data: { id: 42, reference_number: 'TK-2026-0042' } as never,
    });
    vi.mocked(setPropertyAddressAction).mockResolvedValue({ ok: true });
    vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true });
    vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true });
  });

  it('renders all required sections', () => {
    renderForm();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain('Informations générales');
    expect(headings).toContain('Prix');
    expect(headings).toContain('Localisation');
    expect(headings).toContain('Caractéristiques');
    expect(headings).toContain('Description');
    expect(headings).toContain('Photos');
  });

  it('shows the address and GPS section', () => {
    renderForm();
    expect(screen.getByLabelText(/rue \/ adresse/i)).toBeDefined();
    expect(screen.getByLabelText(/code postal/i)).toBeDefined();
    expect(screen.getByLabelText(/pays/i)).toBeDefined();
    expect(screen.getByTestId('location-picker-map')).toBeDefined();
  });

  it('shows year_built and parking_spaces in characteristics', () => {
    renderForm();
    expect(screen.getByLabelText(/année de construction/i)).toBeDefined();
    expect(screen.getByLabelText(/places de parking/i)).toBeDefined();
  });

  it('shows tags section when tags are provided', () => {
    const tags = [
      { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' as const, icon: null, color: null, description: null },
      { id: 2, name: 'Parking', slug: 'parking', type: 'amenity' as const, icon: null, color: null, description: null },
    ];
    renderForm(tags);
    expect(screen.getByText('Équipements')).toBeDefined();
    expect(screen.getByText('Piscine')).toBeDefined();
    expect(screen.getByText('Parking')).toBeDefined();
  });

  it('does not show tags section when no tags provided', () => {
    renderForm([]);
    expect(screen.queryByText('Équipements')).toBeNull();
  });

  it('submits and calls createPropertyAction with basic fields only', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /soumettre à publication/i }));
    await waitFor(() => {
      expect(createPropertyAction).toHaveBeenCalledOnce();
      const payload = vi.mocked(createPropertyAction).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.title).toBe('Ma villa test');
      expect(payload.price).toBe(500000);
      // Address fields must NOT go to createPropertyAction
      expect('street' in payload).toBe(false);
      expect('tag_ids' in payload).toBe(false);
    });
  });

  it('redirects to the created draft detail page after server id confirmation', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /enregistrer en brouillon/i }));

    await waitFor(() => {
      expect(createPropertyAction).toHaveBeenCalledOnce();
      expect(routerMocks.push).toHaveBeenCalledWith('/app/properties/42');
    });
    expect(vi.mocked(createPropertyAction).mock.calls[0][0]).toMatchObject({
      status: 'draft',
      visibility: 'private',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Bien créé. Ouverture de la fiche');
  });

  it('redirects to the created detail page after publication submission', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /soumettre à publication/i }));

    await waitFor(() => {
      expect(createPropertyAction).toHaveBeenCalledOnce();
      expect(routerMocks.push).toHaveBeenCalledWith('/app/properties/42');
    });
    expect(vi.mocked(createPropertyAction).mock.calls[0][0]).toMatchObject({
      status: 'pending_review',
      visibility: 'private',
    });
  });

  it('calls setPropertyAddressAction when street is filled', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/rue \/ adresse/i), '12 Rue des Baobabs');
    await user.click(screen.getByRole('button', { name: /soumettre à publication/i }));
    await waitFor(() => {
      expect(setPropertyAddressAction).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ street: '12 Rue des Baobabs' }),
      );
    });
  });

  it('calls setPropertyTagsAction when tags are selected', async () => {
    const user = userEvent.setup();
    const tags = [
      { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' as const, icon: null, color: null, description: null },
    ];
    renderForm(tags);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Piscine' }));
    await user.click(screen.getByRole('button', { name: /soumettre à publication/i }));
    await waitFor(() => {
      expect(setPropertyTagsAction).toHaveBeenCalledWith(42, [1]);
    });
  });

  it('does not call setPropertyTagsAction when no tags selected', async () => {
    const user = userEvent.setup();
    const tags = [
      { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' as const, icon: null, color: null, description: null },
    ];
    renderForm(tags);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /soumettre à publication/i }));
    await waitFor(() => {
      expect(createPropertyAction).toHaveBeenCalledOnce();
    });
    expect(setPropertyTagsAction).not.toHaveBeenCalled();
  });

  it('shows validation error when city is empty', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/titre/i), 'Villa');
    await user.clear(screen.getByLabelText(/prix/i));
    await user.type(screen.getByLabelText(/prix/i), '100000');
    // city left blank
    await user.click(screen.getByRole('button', { name: /soumettre à publication/i }));
    await waitFor(() => {
      expect(screen.getByText(/la ville est requise/i)).toBeDefined();
    });
    expect(createPropertyAction).not.toHaveBeenCalled();
  });

  it('keeps entered values and stays on the form when creation fails', async () => {
    vi.mocked(createPropertyAction).mockResolvedValue({
      ok: false,
      status: 500,
      message: 'Création impossible.',
    });
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /enregistrer en brouillon/i }));

    // Le message du server action est DÉJÀ traduit et plus précis que le générique : il gagne.
    // L'ordre inverse jetait aussi le `t('missingIdError')` que ce même formulaire lève en 500
    // (`PropertyForm.tsx:192`). La 5xx anglaise de Laravel (« Server Error ») reste, elle,
    // remplacée par le libellé générique — cf. SENTINELLES_FRAMEWORK dans `src/lib/api.ts`.
    expect(await screen.findByText('Création impossible.')).toBeDefined();
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/titre/i)).toHaveValue('Ma villa test');
    expect(screen.getByLabelText(/ville/i)).toHaveValue('Dakar');
  });

  it('shows description character counter', () => {
    renderForm();
    expect(screen.getByText(/0 \/ 10 000 caractères/i)).toBeDefined();
  });

  it('shows photo count', () => {
    renderForm();
    expect(screen.getByText(/0 \/ 10 photo/i)).toBeDefined();
  });
});
