/** TCK-633 (lot C, AC8 / AC12) — « Appeler » révèle tous les numéros au même geste. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const AGENT: PropertyOwnerLite = {
  id: 2, name: 'Ousmane Ndiaye', slug: 'ousmane-ndiaye', avatar_url: null, is_agent: true, member_since: null,
};

function monter(contact: PropertyOwnerLite) {
  return render(withIntl(
    <PropertyAgentCard contact={contact} agency={null} propertySlug="villa" propertyTitle="Villa" onMessage={() => {}} />,
  ));
}

beforeEach(() => {
  apiFetch.mockReset();
  toastAdd.mockReset();
});

describe('<PropertyAgentCard> — TCK-633', () => {
  it('plusieurs numéros : la liste, titrée, derrière « Appeler »', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact')
        ? Promise.resolve({ data: [
            { phone: '+221770000801', whatsapp: true, label: null, kind: 'primary' },
            { phone: '+221770000803', whatsapp: false, label: 'Gardien', kind: 'on_site' },
          ] })
        : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    monter({ ...AGENT, has_phone: true });

    await user.click(screen.getByRole('button', { name: /appeler/i }));

    const liste = await screen.findByTestId('numeros-de-contact');
    expect(within(liste).getByRole('link', { name: /\+221770000801/ })).toHaveAttribute('href', 'tel:+221770000801');
    expect(within(liste).getByText('Numéro principal')).toBeInTheDocument();
    expect(within(liste).getByText('Gardien')).toBeInTheDocument();
  });

  it('aucun numéro : un toast, pas de liste', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact') ? Promise.resolve({ data: [] }) : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    monter({ ...AGENT, has_phone: true });

    await user.click(screen.getByRole('button', { name: /appeler/i }));

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
    expect(screen.queryByTestId('numeros-de-contact')).not.toBeInTheDocument();
  });

  it('WhatsApp seulement si un numéro est déclaré WhatsApp', () => {
    const { unmount } = monter({ ...AGENT, has_phone: true, has_whatsapp: false });
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
    unmount();

    monter({ ...AGENT, has_phone: true, has_whatsapp: true });
    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeInTheDocument();
  });
});
