'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CLE_I18N_ERREUR_API, messageErreurApi } from '@/lib/api';

/**
 * Traduit une erreur réseau en libellé affichable, **côté client**.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE HOOK EXISTE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `ApiError` porte une **donnée** — un code (`codeErreur`) — et jamais du texte prêt à afficher.
 * Il ne le peut pas : le même objet est lu depuis trois contextes qui n'accèdent pas au
 * dictionnaire de la même façon.
 *
 * | contexte | primitive de traduction |
 * |---|---|
 * | composant client | `useTranslations` — **ce hook** |
 * | module `'use server'` (`src/app/actions/`) | `getTranslations()` de `next-intl/server` |
 * | `useApiForm`, gestionnaires React Query | `messageErreurApi` avec le `t` de l'appelant |
 *
 * La version précédente contournait le problème avec un traducteur rangé dans une **variable de
 * module**, enregistré par `QueryProvider`. Ça ne pouvait pas marcher : `QueryProvider` est
 * `'use client'`, donc les 16 modules `'use server'` n'étaient jamais couverts et rendaient la
 * CLÉ i18n brute (`errors.api.unauthenticated`) à l'écran — le défaut même que le chantier venait
 * de corriger sur les messages de validation. Et un global de processus Node est partagé entre
 * requêtes concurrentes : la locale d'un visiteur aurait fuité sur celle du suivant.
 *
 * ```tsx
 * const t = useTranslations('leases.deposit');
 * const messageErreur = useMessageErreurApi();
 * // …
 * onError: (err) => setError(messageErreur(err, t('refundFailed'))),
 * ```
 *
 * @returns `(erreur, repli?) => string` — `repli` est le libellé métier **déjà traduit** de
 *          l'appelant ; à défaut, le libellé générique `errors.api.unknown`.
 */
export function useMessageErreurApi(): (erreur: unknown, repli?: string) => string {
  const t = useTranslations();
  // `useCallback` est ici SÉMANTIQUE, pas une optimisation : la fonction rendue est déclarée dans
  // les tableaux de dépendances de plusieurs `useCallback` appelants. Sans identité stable, chacun
  // se reconstruirait à chaque rendu — et `react-hooks/exhaustive-deps` obligerait à mentir.
  return useCallback(
    (erreur: unknown, repli?: string) =>
      messageErreurApi(erreur, t, repli ?? t(CLE_I18N_ERREUR_API.unknown)),
    [t],
  );
}
