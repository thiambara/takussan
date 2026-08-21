'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';

import { TIMEZONE } from './config';
import { surErreurIntl } from './erreurs';

type Messages = Record<string, unknown>;

/**
 * Les deux providers de traduction du produit — et la raison pour laquelle il y en a DEUX.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE QUI GOUVERNE CE FICHIER : LES PROVIDERS IMBRIQUÉS **REMPLACENT**
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Mesuré au code, `use-intl` (`dist/esm/production/react.js`) :
 *
 * ```js
 * messages: void 0 === i ? w?.messages : i        // i = la prop, w = le contexte parent
 * ```
 *
 * Un provider imbriqué qui reçoit `messages` **écrase** l'ensemble du parent — il ne le complète
 * pas. Une frontière qui ne déclarerait que ses propres espaces perdrait donc ceux de la chrome
 * montée au-dessus d'elle (bannières, widget de discussion, frontière d'erreur racine).
 *
 * La parade n'est PAS de se rappeler d'écrire l'union à la main : c'est que l'union soit déjà
 * faite. `messagesPour()` lit `namespaces.json`, où chaque frontière porte son ensemble **cumulé**
 * — le sien plus celui de tous ses parents —, table DÉRIVÉE du graphe d'imports par
 * `scripts/check-i18n-namespaces.mjs`. Rien n'est à réunir au point d'appel, donc rien n'est à
 * oublier.
 *
 * Le corollaire, lui, est plus dangereux qu'il n'en a l'air : **un provider imbriqué écrit sans
 * prop `messages` hérite silencieusement de son parent.** Il ne rougit nulle part ; il rend
 * seulement des `MISSING_MESSAGE` là où le parent est plus pauvre que l'enfant. C'est pour ce cas
 * précis que la garde vérifie que chaque `layout.tsx` déclaré frontière contient bien un appel à
 * `messagesPour`.
 *
 * ⚠️ `locale`, `timeZone` et `onError`, EUX, s'héritent (même ligne de `use-intl` : `f||w?.onError`).
 * `IntlProvider` n'a donc pas besoin d'être `async` pour aller chercher la locale — il la lit dans
 * le contexte parent. Ça compte : `(auth)/layout.tsx` appelle `useTranslations`, ce qui interdit
 * d'en faire un composant `async`.
 */
export function IntlProviderRacine({
  locale,
  messages,
  children,
}: {
  readonly locale: string;
  readonly messages: Messages;
  readonly children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={TIMEZONE}
      onError={surErreurIntl}
    >
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * Provider d'une frontière IMBRIQUÉE. La locale vient du contexte parent — cf. l'en-tête.
 */
export function IntlProvider({
  messages,
  children,
}: {
  readonly messages: Messages;
  readonly children: ReactNode;
}) {
  const locale = useLocale();
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={TIMEZONE}
      onError={surErreurIntl}
    >
      {children}
    </NextIntlClientProvider>
  );
}
