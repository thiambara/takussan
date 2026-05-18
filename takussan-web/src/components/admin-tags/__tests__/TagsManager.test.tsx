import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import { TagsManager } from '../TagsManager';

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/app/actions/admin-tags', () => ({
  createTagAction: (...args: unknown[]) => createMock(...args),
  updateTagAction: (...args: unknown[]) => updateMock(...args),
  deleteTagAction: (...args: unknown[]) => deleteMock(...args),
}));

const initialTags = [
  {
    id: 1,
    name: 'Piscine',
    slug: 'piscine',
    type: 'amenity' as const,
    icon: null,
    color: '#2563eb',
    description: null,
  },
  {
    id: 2,
    name: 'Meublé',
    slug: 'meuble',
    type: 'feature' as const,
    icon: null,
    color: null,
    description: null,
  },
];

function renderTagsManager() {
  return render(
    <NextIntlClientProvider locale="fr" messages={{ common: { actions: { close: 'Fermer' } } }}>
      <TagsManager initialTags={initialTags} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<TagsManager />', () => {
  it('renders the initial tags in the table', () => {
    renderTagsManager();
    expect(screen.getByText('Piscine')).toBeInTheDocument();
    expect(screen.getByText('Meublé')).toBeInTheDocument();
  });

  it('filters by type via the tabs', async () => {
    const user = userEvent.setup();
    renderTagsManager();
    await user.click(screen.getByRole('tab', { name: 'Caractéristiques' }));
    expect(screen.queryByText('Piscine')).not.toBeInTheDocument();
    expect(screen.getByText('Meublé')).toBeInTheDocument();
  });

  it('surfaces a 409 from delete with a clear fallback message', async () => {
    const user = userEvent.setup();
    deleteMock.mockResolvedValue({ ok: false, status: 409, message: 'Tag in use' });

    renderTagsManager();
    const row = screen.getByText('Piscine').closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /Supprimer/ }));

    expect(deleteMock).toHaveBeenCalledWith(1);
    expect(await screen.findByText(/utilisé par un ou plusieurs biens/i)).toBeInTheDocument();
  });

  it('opens the create dialog and calls createTagAction on submit', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      ok: true,
      data: {
        id: 3,
        name: 'Climatisation',
        slug: 'climatisation',
        type: 'amenity',
        icon: null,
        color: null,
        description: null,
      },
    });

    renderTagsManager();
    await user.click(screen.getByRole('button', { name: 'Nouveau tag' }));

    const nameInput = await screen.findByLabelText(/Libellé/);
    await user.type(nameInput, 'Climatisation');
    await user.click(screen.getByRole('button', { name: 'Créer le tag' }));

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'Climatisation', type: 'amenity' });
  });
});
