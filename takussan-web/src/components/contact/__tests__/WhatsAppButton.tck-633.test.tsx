/** TCK-633 (lot C, AC8) — le bouton WhatsApp vise le PREMIER numéro déclaré WhatsApp. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { WhatsAppButton } from '../WhatsAppButton';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

describe('<WhatsAppButton> — TCK-633', () => {
  let fenetre: { location: { href: string }; opener: unknown; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiFetch.mockReset();
    toastAdd.mockReset();
    fenetre = { location: { href: '' }, opener: window, close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => fenetre));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sans numéro WhatsApp déclaré, aucun bouton', () => {
    const { container } = render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasWhatsApp={false} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('vise le premier numéro déclaré WhatsApp, pas le principal', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact')
        ? Promise.resolve({ data: [
            { phone: '+221770000801', whatsapp: false, label: null, kind: 'primary' },
            { phone: '+221770000803', whatsapp: true, label: 'Gardien', kind: 'on_site' },
          ] })
        : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasWhatsApp />));

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(fenetre.location.href).toMatch(/^https:\/\/wa\.me\/221770000803\?text=/));
  });

  it('aucun numéro WhatsApp dans la liste : la fenêtre se referme, un toast le dit', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact')
        ? Promise.resolve({ data: [{ phone: '+221770000801', whatsapp: false, label: null, kind: 'primary' }] })
        : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasWhatsApp />));

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(fenetre.close).toHaveBeenCalled());
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
