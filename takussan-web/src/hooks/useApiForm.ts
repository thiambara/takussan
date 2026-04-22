'use client';

import { useCallback, useState } from 'react';
import {
  type DefaultValues,
  type FieldValues,
  type Path,
  type SubmitHandler,
  type UseFormProps,
  useForm,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType } from 'zod';

import { ApiError } from '@/lib/api';

/**
 * Options for {@link useApiForm}.
 */
export interface UseApiFormOptions<
  TValues extends FieldValues,
  TResult,
> {
  /** Zod schema describing the form shape. Used as the RHF resolver. */
  readonly schema: ZodType<TValues>;
  /** Initial values (required by RHF when the resolver is typed). */
  readonly defaultValues: DefaultValues<TValues>;
  /** Network call invoked with the validated values. */
  readonly onSubmit: (values: TValues) => Promise<TResult>;
  /** Invoked after a successful submission with the backend result. */
  readonly onSuccess?: (result: TResult, values: TValues) => void | Promise<void>;
  /**
   * Invoked with a processed `ApiError` when the submission fails and
   * we couldn't map it to a specific field. Useful for toasts. Omit to
   * rely only on the `globalError` state exposed by the hook.
   */
  readonly onError?: (error: ApiError | Error) => void;
  /** Extra react-hook-form options forwarded to {@link useForm}. */
  readonly formOptions?: Omit<
    UseFormProps<TValues>,
    'defaultValues' | 'resolver'
  >;
}

/**
 * Return shape of {@link useApiForm}. Exposes the RHF instance plus a few
 * ergonomic helpers to simplify the common case.
 */
export interface UseApiFormReturn<TValues extends FieldValues> {
  readonly form: UseFormReturn<TValues>;
  /** `true` while the network submission is in flight. */
  readonly isSubmitting: boolean;
  /**
   * Non-field-specific error message (e.g. 429 rate-limit, 500, network
   * failure). Consumers render this via `<FormGlobalError>`.
   */
  readonly globalError: string | null;
  /** Imperatively clear the global error banner. */
  readonly clearGlobalError: () => void;
  /** Pre-wired submit handler — pass directly to `<form onSubmit>`. */
  readonly handleSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
}

/**
 * Flatten a nested object into dotted paths. `{ address: { city: '' } }` →
 * `['address', 'address.city']`. Arrays are treated as leaves so numeric
 * Laravel keys like `items.0.quantity` line up with array-shaped defaults.
 */
function collectKnownPaths(input: unknown, prefix = ''): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return prefix === '' ? [] : [prefix];
  }
  const paths: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    paths.push(path);
    paths.push(...collectKnownPaths(value, path));
  }
  return paths;
}

/**
 * True when the Laravel key `field` targets a form field we control.
 * Accepts exact matches (`email`), nested matches (`address.city`), and
 * array-indexed matches (`items.0.quantity` → known path `items.0.quantity`
 * OR prefix `items`).
 */
function isFieldKnown(field: string, knownFields: readonly string[]): boolean {
  if (knownFields.includes(field)) return true;
  // `items.0.quantity` should still route when only `items` is known —
  // RHF accepts dotted paths directly.
  return knownFields.some((k) => field.startsWith(`${k}.`));
}

/**
 * Maps Laravel 422 validation errors (`{errors: {field: [msg, ...]}}`)
 * back onto the react-hook-form instance. Supports nested Laravel keys
 * (e.g. `address.city`, `items.0.quantity`) by matching against any
 * known top-level or dotted path. Unknown keys are aggregated into a
 * single "root" error so the caller can still surface them.
 *
 * Exported for unit testing — see `useApiForm.test.ts`.
 */
export function mapValidationErrorsToForm<TValues extends FieldValues>(
  errors: Record<string, string[]>,
  form: UseFormReturn<TValues>,
  knownFields: readonly string[],
): string[] {
  const unknown: string[] = [];
  for (const [field, messages] of Object.entries(errors)) {
    if (!messages || messages.length === 0) continue;
    const message = messages[0];
    if (isFieldKnown(field, knownFields)) {
      form.setError(field as Path<TValues>, { type: 'server', message });
    } else {
      unknown.push(message);
    }
  }
  return unknown;
}

/**
 * Pick a human-readable message out of an arbitrary error.
 */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    }
    if (error.status >= 500) {
      return 'Le serveur a rencontré une erreur. Réessayez dans un instant.';
    }
    return error.displayMessage || fallback;
  }
  if (error instanceof Error && error.name === 'TypeError') {
    return 'La connexion au serveur a échoué. Vérifiez votre connexion internet et réessayez.';
  }
  return fallback;
}

/**
 * Combines `useForm` (react-hook-form + Zod) with a typed async submit
 * that knows how to talk to the Laravel API.
 *
 * Behaviour:
 * - Validates client-side with the Zod schema.
 * - Forwards validated values to `onSubmit`.
 * - On success: calls `onSuccess`.
 * - On {@link ApiError} with status 422: spreads validation errors onto
 *   matching fields via `form.setError`. Unknown keys fall back to the
 *   global error banner.
 * - On any other error: surfaces a friendly message via `globalError`
 *   and invokes `onError` (if provided).
 */
export function useApiForm<
  TValues extends FieldValues,
  TResult = unknown,
>({
  schema,
  defaultValues,
  onSubmit,
  onSuccess,
  onError,
  formOptions,
}: UseApiFormOptions<TValues, TResult>): UseApiFormReturn<TValues> {
  const form = useForm<TValues>({
    ...(formOptions ?? {}),
    // zodResolver's typings for zod v4 require a looser cast here; the
    // runtime still validates via the provided schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as unknown as any),
    defaultValues,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as UseFormReturn<TValues>;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const clearGlobalError = useCallback(() => setGlobalError(null), []);

  const submit: SubmitHandler<TValues> = useCallback(
    async (values) => {
      setGlobalError(null);
      setIsSubmitting(true);

      try {
        const result = await onSubmit(values);
        if (onSuccess) await onSuccess(result, values);
      } catch (err) {
        if (err instanceof ApiError && err.status === 422 && err.validationErrors) {
          // Flatten nested defaults so Laravel keys like `address.city` or
          // `items.0.quantity` map onto the right RHF paths.
          const knownFields = collectKnownPaths(defaultValues);
          const unknown = mapValidationErrorsToForm(
            err.validationErrors,
            form,
            knownFields,
          );
          if (unknown.length > 0) {
            const message = unknown.join(' ');
            setGlobalError(message);
            // Also expose via RHF so devtools / `formState.errors.root`
            // consumers see it — FormGlobalError can use either.
            form.setError('root.serverError', { type: 'server', message });
          }
        } else {
          const message = extractApiErrorMessage(err, 'La soumission a échoué. Réessayez.');
          setGlobalError(message);
          form.setError('root.serverError', { type: 'server', message });
          if (onError && err instanceof Error) onError(err);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [defaultValues, form, onSubmit, onSuccess, onError],
  );

  const handleSubmit = useCallback(
    (e?: React.BaseSyntheticEvent) => form.handleSubmit(submit)(e),
    [form, submit],
  );

  return {
    form,
    isSubmitting,
    globalError,
    clearGlobalError,
    handleSubmit,
  };
}
