'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useLocale, useMessages } from 'next-intl';
import type { ReactNode } from 'react';

import { TIMEZONE } from './config';
import { surErreurIntl } from './erreurs';

type Messages = Record<string, unknown>;

/**
 * Les deux providers de traduction du produit — et la raison pour laquelle il y en a DEUX.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE QUI GOUVERNE CE FICHIER : `use-intl` **REMPLACE** LE DICTIONNAIRE DU PARENT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Mesuré au code, `use-intl` (`dist/esm/production/react.js`) :
 *
 * ```js
 * messages: void 0 === i ? w?.messages : i        // i = la prop, w = le contexte parent
 * ```
 *
 * Un `NextIntlClientProvider` imbriqué qui reçoit `messages` **écrase** l'ensemble du parent — il
 * ne le complète pas. Jusqu'au 2026-10-25, la parade était une table CUMULÉE : chaque frontière
 * portait le sien plus celui de tous ses parents. Elle avait un coût mesuré (P105.02) : une
 * navigation vers `/app/agency` renvoyait les 55 espaces de la section, dont 50 étaient déjà dans
 * le navigateur — 86,4 Ko gzip pour une réponse qui en méritait 15.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA PARADE DEPUIS L'AMENDEMENT D'ADR-0022 DU 2026-10-25 : `IntlProvider` FUSIONNE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le provider de frontière imbriquée lit le dictionnaire de son parent (`useMessages()`) et lui
 * ajoute le sien. La fusion se fait DANS LE NAVIGATEUR : ce qui traverse le fil, c'est la prop
 * `messages`, et `namespaces.json` n'y met plus que le DIFFÉRENTIEL de la frontière — les espaces
 * que son sous-arbre lit et qu'aucun parent ne sert. Rien n'est à réunir au point d'appel.
 *
 * Le corollaire s'inverse. Un provider imbriqué sans prop `messages` n'est plus un piège : il
 * hériterait, comme tout le reste. Le piège est désormais un `NextIntlClientProvider` monté
 * AILLEURS qu'ici, qui remplacerait le dictionnaire de son parent par le seul différentiel. C'est
 * pourquoi `scripts/check-i18n-namespaces.mjs` refuse ce composant hors de ce fichier, et
 * `IntlProviderRacine` hors de `src/app/layout.tsx`.
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
 * Provider d'une frontière IMBRIQUÉE : `messages` est le DIFFÉRENTIEL de la frontière, fusionné
 * ici au dictionnaire du parent. La locale vient du contexte parent — cf. l'en-tête.
 */
export function IntlProvider({
  messages,
  children,
}: {
  readonly messages: Messages;
  readonly children: ReactNode;
}) {
  const locale = useLocale();
  const duParent = useMessages() as Messages;
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ ...duParent, ...messages }}
      timeZone={TIMEZONE}
      onError={surErreurIntl}
    >
      {children}
    </NextIntlClientProvider>
  );
}
