'use client';

import { useCallback, useState } from 'react';
import {
  type DefaultValues,
  type FieldValues,
  type Path,
  type Resolver,
  type ResolverResult,
  type SubmitHandler,
  type UseFormProps,
  useForm,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import type { ZodType } from 'zod';

import { ApiError, messageErreurApi, type TraducteurRacine } from '@/lib/api';
import {
  type Traducteur,
  traduireMessageValidation,
} from '@/lib/schemas/messages';

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
 *
 * ⚠️ **Passer `t` dès qu'on en a un.** Sans traducteur, cette fonction ne sait rendre que du
 * FRANÇAIS — les trois chaînes ci-dessous étaient écrites en dur, et le repli d'`ApiError` valait
 * `API error 401`, affiché tel quel. Avec `t` (un `useTranslations()` **sans argument**), tout
 * passe par le dictionnaire et rend donc aussi l'anglais et le wolof.
 *
 * Le paramètre est optionnel pour ne pas casser les appelants qui n'ont pas de hook sous la main ;
 * ce n'est pas une invitation à s'en passer.
 */
export function extractApiErrorMessage(
  error: unknown,
  fallback: string,
  t: TraducteurRacine,
): string {
  return messageErreurApi(error, t, fallback);
}

/**
 * Le traducteur à la RACINE du dictionnaire, sous la signature minimale que consomment les
 * fonctions de `src/lib/schemas/messages.ts`.
 *
 * ⚠️ **Racine, et non un espace de noms** : les clés portées par les schémas sont des chemins
 * absolus (`validation.tag.nameRequired`). Un composant qui a déjà un `useTranslations('admin.tags')`
 * sous la main ne peut donc PAS s'en servir pour traduire une erreur de schéma — il lui faut
 * celui-ci, en plus.
 *
 * Existe pour que les trois écrans qui rendent un message de schéma sans passer par
 * react-hook-form n'aient pas à recopier le cast — le recopier, c'est se donner l'occasion de le
 * faire à moitié.
 */
export function useTraducteurValidation(): Traducteur {
  return useTranslations() as unknown as Traducteur;
}

/**
 * Traduit EN PROFONDEUR les messages d'un arbre d'erreurs react-hook-form qui portent une clé de
 * `src/lib/schemas/messages.ts` (TCK-292, lot J).
 *
 * **Ce qui est traduit** : toute chaîne préfixée de `validation.` — donc `message`, mais aussi les
 * entrées de `types` quand `criteriaMode: 'all'` est demandé, et les messages d'un champ de tableau
 * (`items.0.quantity`). **Ce qui traverse intact** : tout le reste, à commencer par les messages
 * 422 de Laravel que {@link mapValidationErrorsToForm} repose sur les champs — ils sont déjà
 * rédigés, et les retraduire n'aurait aucun sens.
 *
 * `ref` porte le nœud DOM du champ : il est recopié tel quel, jamais parcouru.
 *
 * Exportée pour le test unitaire, et parce qu'un consommateur qui monte son propre résolveur peut
 * s'en servir directement.
 */
export function traduireErreursValidation<T>(noeud: T, t: Traducteur): T {
  if (Array.isArray(noeud)) {
    return noeud.map((enfant) => traduireErreursValidation(enfant, t)) as unknown as T;
  }
  if (!noeud || typeof noeud !== 'object') return noeud;

  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(noeud as Record<string, unknown>)) {
    if (cle === 'ref') {
      sortie[cle] = valeur;
      continue;
    }
    if (typeof valeur === 'string') {
      sortie[cle] = traduireMessageValidation(valeur, t);
      continue;
    }
    sortie[cle] = traduireErreursValidation(valeur, t);
  }
  return sortie as T;
}

/**
 * Le résolveur zod de ce dépôt — `zodResolver`, plus la résolution des clés de message.
 *
 * ⚠️ **C'est CE résolveur qu'il faut monter, pas `zodResolver` nu.** Les schémas de
 * `src/lib/schemas/` portent une clé et non un libellé (voir l'en-tête de
 * `src/lib/schemas/messages.ts` pour la raison) : un `zodResolver(schema)` direct afficherait
 * `validation.property.titleRequired` à l'utilisateur. {@link useApiForm} l'emploie déjà ; les
 * formulaires qui appellent `useForm` eux-mêmes doivent le substituer.
 */
export function useResolveurValidation<TValues extends FieldValues>(
  schema: ZodType<TValues>,
): Resolver<TValues> {
  const t = useTraducteurValidation();

  return async (values, context, options) => {
    // zodResolver's typings for zod v4 require a looser cast here; the
    // runtime still validates via the provided schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base = zodResolver(schema as unknown as any) as unknown as Resolver<TValues>;
    const resultat = await base(values, context, options);
    // Le cast rétablit l'union discriminée que l'étalement efface : la FORME du résultat est
    // inchangée — seules les chaînes `message` sont remplacées par leur traduction.
    return {
      ...resultat,
      errors: traduireErreursValidation(resultat.errors, t),
    } as ResolverResult<TValues>;
  };
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
  const resolver = useResolveurValidation(schema);
  // Traducteur à la RACINE — les clés d'erreur réseau sont des chemins absolus (`errors.api.…`).
  const tRacine = useTranslations();

  const form = useForm<TValues>({
    ...(formOptions ?? {}),
    resolver,
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
          const message = extractApiErrorMessage(
            err,
            tRacine('errors.api.submitFailed'),
            tRacine,
          );
          setGlobalError(message);
          form.setError('root.serverError', { type: 'server', message });
          if (onError && err instanceof Error) onError(err);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [defaultValues, form, onSubmit, onSuccess, onError, tRacine],
  );

  // ⚠ `await` puis rien : le retour est délibérément JETÉ, et ce n'est pas
  // une écriture maladroite. react-hook-form 7.85 a rendu `handleSubmit`
  // générique sur le retour du handler —
  // `<TResult>(onValid) => (e?) => Promise<Awaited<TResult> | undefined>` —
  // et `TResult` ne s'infère pas depuis un handler qui rend `Promise<void>`
  // (il retombe sur `unknown`), ce qui ne s'assigne plus à la signature
  // `Promise<void>` publiée par `UseApiFormReturn`.
  //
  // Fixer le générique à la main (`handleSubmit<void>(…)`) marcherait ici et
  // casserait à la prochaine évolution de cette signature. Envelopper dans
  // une fonction `async` rend `Promise<void>` quelle que soit la forme
  // interne — le contrat de CE hook cesse de dépendre de l'inférence de
  // celui d'en dessous. Aucun appelant ne lit ce retour : `handleSubmit` est
  // branché sur `onSubmit` d'un `<form>`.
  const handleSubmit = useCallback(
    async (e?: React.BaseSyntheticEvent): Promise<void> => {
      await form.handleSubmit(submit)(e);
    },
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
