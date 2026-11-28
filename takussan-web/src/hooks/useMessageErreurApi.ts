'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, CLE_I18N_ERREUR_API, messageErreurApi } from '@/lib/api';

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
 * TCK-3008 — **un écran qui a ses propres libellés de refus** passe ses tables, et la cascade s'écrit ici, une
 * fois (les six recopies du Radar la portaient chacune) :
 *
 * 1. le code métier (`ApiError.codeMetier`) trouvé dans une table, dans l'ordre des tables → sa clé, avec les
 *    paramètres que rend `parametres` (à défaut, les `params` simples de l'API : `{max}` passe tel quel) ;
 * 2. les messages de validation d'un 422, joints — seulement si `validation` est demandé ;
 * 3. puis, comme sans options, {@link messageErreurApi} : le message que l'API a déjà localisé
 *    (ADR-0032), puis le repli.
 *
 * ⚠ Sans options, rien ne change : un 422 affiche la prose de Laravel (« la prose l'emporte »), et la
 * fonction rendue garde son identité d'un rendu à l'autre. Avec des tables écrites dans le rendu, elle
 * change à chaque rendu — comme les cascades qu'elle remplace.
 *
 * ```tsx
 * const t = useTranslations('superAdmin.pages.radar.listing');
 * const messageErreur = useMessageErreurApi({
 *   tables: [{ t: useTranslations('superAdmin.pages.radar.listing.errors'), codes: ERREURS_FICHE_RADAR }],
 *   validation: true,
 * });
 * ```
 *
 * @returns `(erreur, repli?) => string` — `repli` est le libellé métier **déjà traduit** de
 *          l'appelant ; à défaut, le libellé générique `errors.api.unknown`.
 */
export function useMessageErreurApi(options?: OptionsDuMessageErreur): (erreur: unknown, repli?: string) => string {
  const t = useTranslations();
  const tables = options?.tables;
  const validation = options?.validation === true;
  // `useCallback` est ici SÉMANTIQUE, pas une optimisation : la fonction rendue est déclarée dans
  // les tableaux de dépendances de plusieurs `useCallback` appelants. Sans identité stable, chacun
  // se reconstruirait à chaque rendu — et `react-hooks/exhaustive-deps` obligerait à mentir.
  return useCallback(
    (erreur: unknown, repli?: string) => {
      if (erreur instanceof ApiError) {
        const libelle = libelleDeTable(erreur, tables);
        if (libelle !== undefined) return libelle;
        if (validation) {
          const messages = erreur.messagesDeValidation();
          if (messages.length > 0) return messages.join(' ');
        }
      }
      return messageErreurApi(erreur, t, repli ?? t(CLE_I18N_ERREUR_API.unknown));
    },
    [t, tables, validation],
  );
}

/** Valeurs d'un libellé next-intl. */
type ValeursDuLibelle = Record<string, string | number | Date>;

/**
 * Une table de libellés de refus : un traducteur d'espace (`useTranslations('…errors')`), et les codes métier
 * qu'il sait dire, code → clé sous cet espace (les tables de parité du Radar, `ERREURS_FICHE_RADAR`…).
 */
export interface TableDeRefus {
  readonly t: (cle: string, valeurs?: ValeursDuLibelle) => string;
  readonly codes: Readonly<Record<string, string>>;
  /** Les valeurs du libellé de `code` ; à défaut, les `params` de l'API qui sont des textes ou des nombres. */
  readonly parametres?: (code: string, erreur: ApiError) => ValeursDuLibelle;
}

export interface OptionsDuMessageErreur {
  /** Consultées dans l'ordre : la première qui connaît le code donne le libellé. */
  readonly tables?: readonly TableDeRefus[];
  /** Un 422 sans code connu dit ses messages de validation, joints, plutôt que la prose générale de Laravel. */
  readonly validation?: boolean;
}

function libelleDeTable(erreur: ApiError, tables: readonly TableDeRefus[] | undefined): string | undefined {
  const code = erreur.codeMetier;
  if (code === undefined || !tables) return undefined;
  for (const table of tables) {
    const cle = table.codes[code];
    if (cle) return table.t(cle, table.parametres ? table.parametres(code, erreur) : parametresSimples(erreur));
  }
  return undefined;
}

/** Les `params` de l'API utilisables tels quels dans un libellé : textes et nombres. */
function parametresSimples(erreur: ApiError): ValeursDuLibelle {
  const valeurs: ValeursDuLibelle = {};
  for (const [nom, valeur] of Object.entries(erreur.params)) {
    if (typeof valeur === 'string' || typeof valeur === 'number') valeurs[nom] = valeur;
  }
  return valeurs;
}
