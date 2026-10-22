/**
 * TCK-1410 (P144.08, ADR-0072 lot 3) — le contact sans compte, du bien comme de l'agent, part sous
 * une clé d'idempotence que le dialogue garde tant que l'envoi échoue : une demande renvoyée après
 * une réponse perdue ne s'écrit qu'une fois.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { AnonymousLeadDialog } from '../AnonymousLeadDialog';

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const onSubmit = vi.fn();

describe('<AnonymousLeadDialog> — clé d’idempotence (TCK-1410)', () => {
  beforeEach(() => {
    onSubmit.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('renvoie la même clé après un échec, et une neuve après un succès', async () => {
    onSubmit
      .mockResolvedValueOnce({ ok: false, message: 'Erreur réseau' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(
      withIntl(
        <AnonymousLeadDialog open onOpenChange={() => {}} onSubmit={onSubmit} defaultMessage="Bonjour, ce bien est-il disponible ?" />,
      ),
    );

    await user.type(screen.getByLabelText('Nom complet'), 'Awa Diop');
    await user.type(screen.getByLabelText(/téléphone/i), '771234567');
    for (const appel of [1, 2, 3]) {
      await user.click(screen.getByRole('button', { name: /envoyer/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(appel));
    }

    const [premiere, seconde, troisieme] = onSubmit.mock.calls.map((a) => a[1] as string);
    expect(premiere).toMatch(/^[0-9a-f-]{36}$/);
    expect(seconde).toBe(premiere);
    expect(troisieme).not.toBe(premiere);
  });
});
