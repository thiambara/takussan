import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import {
  useApiForm,
  mapValidationErrorsToForm,
  extractApiErrorMessage,
} from '../useApiForm';

const schema = z.object({
  email: z.string().email('Email invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = { email: '', password: '' };

/**
 * Le traducteur RACINE, bâti sur le VRAI dictionnaire français.
 *
 * ⚠ Ces cinq cas passaient auparavant un `t` absent, et `extractApiErrorMessage` retombait alors
 * sur des libellés français ÉCRITS EN DUR dans le hook. Ils gardaient donc une propriété vraie
 * (« un 429 dit quelque chose sur les tentatives ») par le mauvais chemin : celui-là même qui
 * rendait du français à un anglophone. Le traducteur est désormais OBLIGATOIRE — c'est le
 * compilateur qui tient la propriété — et ces cas la vérifient à travers `fr.json`, donc plus
 * fort qu'avant : une clé absente du dictionnaire les fait rougir.
 */
const tRacine = ((cle: string) => {
  const valeur = cle
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], fr);
  return typeof valeur === 'string' ? valeur : cle;
}) as unknown as Parameters<typeof extractApiErrorMessage>[2];

describe('extractApiErrorMessage', () => {
  it('returns a friendly message for 429', () => {
    const err = new ApiError(429, { message: 'Too many requests' });
    expect(extractApiErrorMessage(err, 'fallback', tRacine)).toMatch(/tentatives/i);
  });

  it('returns a friendly message for 5xx', () => {
    const err = new ApiError(500, null);
    expect(extractApiErrorMessage(err, 'fallback', tRacine)).toMatch(/serveur/i);
  });

  it('returns the server message when available', () => {
    const err = new ApiError(400, { message: 'Email déjà utilisé' });
    expect(extractApiErrorMessage(err, 'fallback', tRacine)).toBe('Email déjà utilisé');
  });

  it('returns a network message for TypeError (fetch failure)', () => {
    const err = new TypeError('fetch failed');
    expect(extractApiErrorMessage(err, 'fallback', tRacine)).toMatch(/connexion/i);
  });

  it('returns the fallback for unknown errors', () => {
    expect(extractApiErrorMessage('nope', 'fallback', tRacine)).toBe('fallback');
  });
});

describe('mapValidationErrorsToForm', () => {
  it('sets known field errors and returns unknown ones', () => {
    const setError = vi.fn();
    const fakeForm = { setError } as unknown as Parameters<
      typeof mapValidationErrorsToForm<FormValues>
    >[1];

    const unknown = mapValidationErrorsToForm<FormValues>(
      {
        email: ['Email déjà pris.'],
        password: ['Trop court.'],
        server_only: ['Boom'],
      },
      fakeForm,
      ['email', 'password'],
    );

    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server',
      message: 'Email déjà pris.',
    });
    expect(setError).toHaveBeenCalledWith('password', {
      type: 'server',
      message: 'Trop court.',
    });
    expect(unknown).toEqual(['Boom']);
  });

  it('routes dotted Laravel keys onto nested field paths', () => {
    const setError = vi.fn();
    const fakeForm = { setError } as unknown as Parameters<
      typeof mapValidationErrorsToForm<FormValues>
    >[1];

    const unknown = mapValidationErrorsToForm<FormValues>(
      {
        'address.city': ['Ville requise.'],
        'items.0.quantity': ['Doit être > 0.'],
        something_else: ['Bruit'],
      },
      fakeForm,
      ['address', 'address.city', 'items'],
    );

    expect(setError).toHaveBeenCalledWith('address.city', {
      type: 'server',
      message: 'Ville requise.',
    });
    // `items.0.quantity` is matched via the `items` prefix.
    expect(setError).toHaveBeenCalledWith('items.0.quantity', {
      type: 'server',
      message: 'Doit être > 0.',
    });
    expect(unknown).toEqual(['Bruit']);
  });

  it('ignores empty message arrays', () => {
    const setError = vi.fn();
    const fakeForm = { setError } as unknown as Parameters<
      typeof mapValidationErrorsToForm<FormValues>
    >[1];

    mapValidationErrorsToForm<FormValues>(
      { email: [] },
      fakeForm,
      ['email'],
    );

    expect(setError).not.toHaveBeenCalled();
  });
});

/**
 * ⚠️ `useApiForm` appelle `useTranslations` depuis TCK-292 (lot J) : les schémas zod portent une
 * CLÉ de message et c'est le résolveur du hook qui la résout. Sans provider, `useTranslations`
 * LÈVE — d'où le harnais, qui charge les VRAIS dictionnaires plutôt qu'un `messages={{}}` (lequel
 * rendrait la clé et ferait passer un test sur un affichage cassé).
 */
function wrapper({ children }: { children: ReactNode }) {
  return withIntl(children);
}

describe('useApiForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSuccess when the submit resolves', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useApiForm<FormValues, { ok: boolean }>({
        schema,
        defaultValues,
        onSubmit,
        onSuccess,
      }),
      { wrapper },
    );

    act(() => {
      result.current.form.setValue('email', 'jane@example.com');
      result.current.form.setValue('password', 'secret');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: 'secret',
    });
    expect(onSuccess).toHaveBeenCalledWith({ ok: true }, {
      email: 'jane@example.com',
      password: 'secret',
    });
    expect(result.current.globalError).toBeNull();
  });

  it('maps a 422 API error onto the matching fields', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(422, {
        message: 'Validation failed',
        errors: { email: ['Email déjà utilisé.'] },
      }),
    );

    const { result } = renderHook(() =>
      useApiForm<FormValues, unknown>({
        schema,
        defaultValues,
        onSubmit,
      }),
      { wrapper },
    );

    act(() => {
      result.current.form.setValue('email', 'jane@example.com');
      result.current.form.setValue('password', 'secret');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(result.current.form.getFieldState('email').error?.message).toBe(
        'Email déjà utilisé.',
      );
    });
    // No unknown field → global error stays null.
    expect(result.current.globalError).toBeNull();
  });

  it('falls back to globalError for unknown 422 keys', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(422, {
        message: 'Validation failed',
        errors: { captcha: ['Captcha incorrect.'] },
      }),
    );

    const { result } = renderHook(() =>
      useApiForm<FormValues, unknown>({
        schema,
        defaultValues,
        onSubmit,
      }),
      { wrapper },
    );

    act(() => {
      result.current.form.setValue('email', 'jane@example.com');
      result.current.form.setValue('password', 'secret');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(result.current.globalError).toBe('Captcha incorrect.');
    });
    // Global errors also land on RHF's `root.serverError` slot so consumers
    // observing `formState.errors.root` see them.
    // ⚠ `getFieldState` et NON `formState.errors.root` — essayé, et faux ici.
    // `formState` est un Proxy qui n'observe que ce qui a été LU PENDANT UN
    // RENDU ; dans un `renderHook` sans composant qui lise `errors`, rien ne
    // s'abonne et `errors.root` reste `undefined` alors que l'erreur est bien
    // posée. `getFieldState` lit l'état directement, sans passer par
    // l'abonnement — c'est ce qui rend l'assertion vraie.
    //
    // Le `as never` portait sur le NOM (react-hook-form 7.85 en dérive alors
    // un type d'erreur `never`, et `.error?.message` ne compile plus) ; il
    // porte désormais sur le RÉSULTAT. `root.serverError` n'est pas un
    // `FieldPath` des valeurs du formulaire — c'est le slot d'erreur globale
    // de react-hook-form — donc aucun typage exact n'existe côté nom.
    await waitFor(() => {
      const state = result.current.form.getFieldState('root.serverError' as never) as {
        error?: { message?: string };
      };
      expect(state.error?.message).toBe('Captcha incorrect.');
    });
  });

  it('surfaces a friendly message for a 429 response', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(429, { message: 'Too many requests' }),
    );

    const { result } = renderHook(() =>
      useApiForm<FormValues, unknown>({
        schema,
        defaultValues,
        onSubmit,
      }),
      { wrapper },
    );

    act(() => {
      result.current.form.setValue('email', 'jane@example.com');
      result.current.form.setValue('password', 'secret');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(result.current.globalError).toMatch(/tentatives/i);
    });
  });

  it('blocks submission when client-side validation fails', async () => {
    const onSubmit = vi.fn();

    const { result } = renderHook(() =>
      useApiForm<FormValues, unknown>({
        schema,
        defaultValues,
        onSubmit,
      }),
      { wrapper },
    );

    // Email is empty → Zod rejects before onSubmit is called.
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
