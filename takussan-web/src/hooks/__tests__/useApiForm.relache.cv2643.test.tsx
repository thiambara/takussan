import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { useApiForm } from '../useApiForm';

// Sonde de la contre-vérification TCK-2643 : la garde r3 se relâche après chaque issue d'un envoi.
const schema = z.object({ email: z.string().email('x'), password: z.string().min(1, 'y') });
type V = z.infer<typeof schema>;
const wrapper = ({ children }: { children: ReactNode }) => withIntl(<>{children}</>);

async function deuxEnvois(premier: () => Promise<unknown>, remplir = true) {
  const onSubmit = vi.fn(premier);
  const { result } = renderHook(
    () => useApiForm<V, unknown>({ schema, defaultValues: { email: '', password: '' }, onSubmit }),
    { wrapper },
  );
  if (remplir) {
    act(() => {
      result.current.form.setValue('email', 'jane@example.com');
      result.current.form.setValue('password', 'secret');
    });
  }
  await act(async () => { await result.current.handleSubmit(); });
  act(() => {
    result.current.form.setValue('email', 'jane@example.com');
    result.current.form.setValue('password', 'secret');
  });
  onSubmit.mockImplementation(async () => ({ ok: true }));
  const avant = onSubmit.mock.calls.length;
  await act(async () => { await result.current.handleSubmit(); });
  await waitFor(() => expect(onSubmit.mock.calls.length).toBe(avant + 1));
}

describe('useApiForm — la garde r3 se relâche (sonde CV TCK-2643)', () => {
  it('après un 422', async () => {
    await deuxEnvois(async () => { throw new ApiError(422, { message: 'x', errors: { email: ['pris'] } }); });
  });
  it('après un échec réseau (TypeError)', async () => {
    await deuxEnvois(async () => { throw new TypeError('Failed to fetch'); });
  });
  it('après un 500', async () => {
    await deuxEnvois(async () => { throw new ApiError(500, null); });
  });
  it('après un refus du schéma (onSubmit jamais appelé)', async () => {
    await deuxEnvois(async () => ({ ok: true }), false);
  });
});
