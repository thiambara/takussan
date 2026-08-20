import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { SuperAdminPropertiesFilters } from '../SuperAdminPropertiesFilters';

/**
 * TCK-292 — le composant résout désormais ses libellés par `useTranslations`. `withIntl` monte le
 * VRAI `fr.json` : les assertions françaises ci-dessous sont donc INCHANGÉES, mot pour mot, et un
 * rouge ici signifierait que le libellé a réellement bougé à l'écran (c'est l'AC3 du ticket).
 */

const mockReplace = vi.fn();
const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(''),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

describe('<SuperAdminPropertiesFilters>', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearchParams.get.mockReturnValue(null);
    mockSearchParams.toString.mockReturnValue('');
  });

  it('renders the agency filter populated from props', async () => {
    const user = userEvent.setup();
    render(withIntl(
      <SuperAdminPropertiesFilters
        agencies={[
          { id: 1, name: 'Tabaski Immo' },
          { id: 2, name: 'Sahel Properties' },
        ]}
      />,
    ));
    // The Agence Select trigger is rendered as a shadcn (base-ui) combobox.
    const trigger = screen.getByLabelText('Agence');
    expect(trigger).toBeTruthy();

    // Options live in a portal and only render after the trigger is opened.
    await user.click(trigger);
    expect(await screen.findByRole('option', { name: 'Tabaski Immo' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Sahel Properties' })).toBeTruthy();
  });

  it('writes filter[agency_id] to the URL when an agency is picked', async () => {
    const user = userEvent.setup();
    render(withIntl(
      <SuperAdminPropertiesFilters agencies={[{ id: 12, name: 'Pikine Real Estate' }]} />,
    ));

    await user.click(screen.getByLabelText('Agence'));
    const option = await screen.findByRole('option', { name: 'Pikine Real Estate' });
    await user.click(option);

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bagency_id%5D=12'),
    );
  });

  it('resets pagination when changing a filter', async () => {
    const user = userEvent.setup();
    mockSearchParams.toString.mockReturnValue('page=4');
    render(withIntl(<SuperAdminPropertiesFilters agencies={[]} />));

    await user.click(screen.getByLabelText('Statut'));
    const option = await screen.findByRole('option', { name: 'Disponible' });
    await user.click(option);

    expect(mockReplace).toHaveBeenCalled();
    const replaced = String(mockReplace.mock.calls[0][0]);
    expect(replaced).not.toContain('page=4');
    expect(replaced).toContain('filter%5Bstatus%5D=available');
  });

  it('debounces search via form submit so each keystroke does not refetch', () => {
    render(withIntl(<SuperAdminPropertiesFilters agencies={[]} />));
    const input = screen.getByPlaceholderText(/Rechercher/);
    fireEvent.change(input, { target: { value: 'studio' } });
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.submit(input.closest('form')!);
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bsearch%5D=studio'),
    );
  });
});
