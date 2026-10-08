/**
 * TCK-590 — le formulaire de contact sans compte : un téléphone OU un e-mail (AC3 côté front),
 * la mention de confidentialité (AC19c), la source d'arrivée (AC21), et nom + téléphone retenus.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { AnonymousLeadDialog } from '../AnonymousLeadDialog';

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const onSubmit = vi.fn();

function monter() {
  return render(withIntl(<AnonymousLeadDialog open onOpenChange={() => {}} onSubmit={onSubmit} defaultMessage="Bonjour, ce bien est-il disponible ?" />));
}

describe('<AnonymousLeadDialog> — TCK-590', () => {
  beforeEach(() => {
    onSubmit.mockReset();
    onSubmit.mockResolvedValue({ ok: true });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('un téléphone seul suffit ; la source d’arrivée part avec', async () => {
    window.sessionStorage.setItem('takussan.arrivee', JSON.stringify({ source: 'whatsapp', medium: 'share' }));
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText('Nom complet'), 'Awa Diop');
    await user.type(screen.getByLabelText(/téléphone/i), '771234567');
    await user.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Awa Diop',
      phone: '+221771234567',
      email: undefined,
      source: 'whatsapp',
      medium: 'share',
    });
    expect(JSON.parse(window.localStorage.getItem('takussan.coordonnees') ?? '{}')).toEqual({
      name: 'Awa Diop',
      phone: '+221771234567',
    });
  });

  it('ni téléphone ni e-mail : rien ne part', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText('Nom complet'), 'Awa Diop');
    await user.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(await screen.findByText('Indiquez un téléphone ou un e-mail pour qu’on puisse vous répondre.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC19c — porte un lien vers la politique de confidentialité', () => {
    monter();
    expect(screen.getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/legal\/privacy$/),
    );
  });

  it('nom et téléphone retenus au contact précédent sont reproposés', () => {
    window.localStorage.setItem('takussan.coordonnees', JSON.stringify({ name: 'Awa Diop', phone: '+221771234567' }));
    monter();
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Awa Diop');
  });
});
