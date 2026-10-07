/**
 * TCK-590 — WhatsApp s'ouvre DANS le geste (AC19b), le message prérempli est dans la langue du
 * visiteur (AC19), et un bien sans numéro n'a pas de bouton (AC19).
 *
 * Safari iOS n'associe plus au clic une fenêtre ouverte après un `await` : il la bloque. Le test
 * laisse la requête `…/contact` EN ATTENTE et exige que `window.open` soit déjà appelé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { WhatsAppButton } from '../WhatsAppButton';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

function enAttente<T>() {
  let resoudre!: (v: T) => void;
  let rejeter!: (e: unknown) => void;
  const promesse = new Promise<T>((ok, ko) => {
    resoudre = ok;
    rejeter = ko;
  });
  return { promesse, resoudre, rejeter };
}

describe('<WhatsAppButton> — TCK-590', () => {
  let fenetre: { location: { href: string }; opener: unknown; close: ReturnType<typeof vi.fn> };
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    apiFetch.mockReset();
    toastAdd.mockReset();
    window.sessionStorage.clear();
    fenetre = { location: { href: '' }, opener: window, close: vi.fn() };
    open = vi.fn(() => fenetre);
    vi.stubGlobal('open', open);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sans numéro, aucun bouton', () => {
    const { container } = render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasPhone={false} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('AC19b — la fenêtre est ouverte AVANT que le numéro n’arrive, puis dirigée vers wa.me', async () => {
    const contact = enAttente<{ phone: string }>();
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact') ? contact.promesse : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(withIntl(<WhatsAppButton slug="villa" title="Villa des Almadies" hasPhone />));

    await user.click(screen.getByRole('button'));

    // La requête n'est pas résolue : la fenêtre doit déjà exister.
    expect(open).toHaveBeenCalledTimes(1);
    expect(fenetre.location.href).toBe('');

    contact.resoudre({ phone: '+221 77 123 45 67' });
    await waitFor(() => expect(fenetre.location.href).toMatch(/^https:\/\/wa\.me\/221771234567\?text=/));
    expect(open).toHaveBeenCalledTimes(1);
    expect(fenetre.opener).toBeNull();
    const texte = decodeURIComponent(fenetre.location.href.split('?text=')[1]);
    expect(texte).toContain('« Villa des Almadies »');
  });

  it('AC19 — en anglais, le message prérempli est en anglais', async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact') ? Promise.resolve({ phone: '+221771234567' }) : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(withIntl(<WhatsAppButton slug="villa" title="Almadies villa" hasPhone />, 'en'));

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(fenetre.location.href).toContain('wa.me'));
    const texte = decodeURIComponent(fenetre.location.href.split('?text=')[1]);
    expect(texte).toMatch(/^Hello, I am interested in “Almadies villa” seen on Takussan: /);
  });

  it('un échec referme la fenêtre et passe par un toast, jamais par une boîte native', async () => {
    const alerte = vi.fn();
    vi.stubGlobal('alert', alerte);
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact') ? Promise.reject(new Error('429')) : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasPhone />));

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(fenetre.close).toHaveBeenCalled());
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(alerte).not.toHaveBeenCalled();
  });

  it('AC20 / AC21 — le clic laisse une trace, avec la source d’arrivée retenue', async () => {
    window.sessionStorage.setItem('takussan.arrivee', JSON.stringify({ source: 'whatsapp', medium: 'share' }));
    apiFetch.mockImplementation((path: string) =>
      path.endsWith('/contact') ? Promise.resolve({ phone: '+221771234567' }) : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(withIntl(<WhatsAppButton slug="villa" title="Villa" hasPhone />));

    await user.click(screen.getByRole('button'));

    const clic = apiFetch.mock.calls.find(([path]) => String(path).endsWith('/contact-click'));
    expect(clic?.[0]).toBe('/public/properties/villa/contact-click');
    expect(JSON.parse(String(clic?.[1]?.body))).toEqual({ channel: 'whatsapp', source: 'whatsapp', medium: 'share' });
  });
});
