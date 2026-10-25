'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { BarreDeMarque } from '@/components/brand/BarreDeMarque';
import { Button } from '@/components/ui/button';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isLocale, type Locale } from '@/i18n/config';
import { IntlProviderRacine } from '@/i18n/IntlProvider';
import { decouperLocale } from '@/i18n/routing';
import { ligneErreur } from '@/lib/journal-erreur';

/**
 * TCK-2356 (P14.07) — l'écran de `src/app/global-error.tsx`, rendu quand le layout RACINE lève.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL CHARGE LUI-MÊME SON DICTIONNAIRE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `global-error` REMPLACE le layout racine : aucun provider next-intl ne l'entoure, et la langue
 * n'arrive pas en paramètre. Il la lit donc dans l'URL (`/en/…`), à défaut dans le cookie de
 * langue (la console n'a pas de préfixe), à défaut le français, puis charge le dictionnaire de
 * cette langue par `import()` dynamique — un morceau à part, téléchargé seulement le jour où le
 * layout racine tombe, jamais par une page saine. Tant qu'il n'est pas là, l'écran ne porte que
 * la mise en page : le texte reste celui du dictionnaire (principe n° 5), jamais une copie en dur.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE JOURNAL
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Une ligne JSON dans la console DU NAVIGATEUR, de la forme de `@/lib/journal-erreur`, sans le
 * message. Le navigateur n'a pas de sortie standard : la ligne du serveur pour la même erreur est
 * celle d'`onRequestError` (`src/instrumentation.ts`), et le `digest` les relie.
 */
type Props = {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
};

type Messages = Record<string, unknown>;

/** Trois `import()` statiques plutôt qu'un gabarit : chaque bundler en fait un morceau par langue. */
const DICTIONNAIRES: Record<Locale, () => Promise<{ default: Messages }>> = {
  fr: () => import('@/messages/fr.json'),
  en: () => import('@/messages/en.json'),
  wo: () => import('@/messages/wo.json'),
};

function localeDuNavigateur(): Locale {
  const depuisUrl = decouperLocale(window.location.pathname).locale;
  if (depuisUrl) return depuisUrl;
  const cookie = document.cookie
    .split('; ')
    .find((paire) => paire.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.slice(LOCALE_COOKIE_NAME.length + 1);
  return cookie && isLocale(cookie) ? cookie : DEFAULT_LOCALE;
}

export function EcranErreurGlobale({ error, retry }: Props) {
  const [dictionnaire, setDictionnaire] = useState<{ locale: Locale; messages: Messages } | null>(null);

  useEffect(() => {
    console.error(JSON.stringify(ligneErreur('global_error', error)));
  }, [error]);

  useEffect(() => {
    let actif = true;
    const locale = localeDuNavigateur();
    document.documentElement.lang = locale;
    void DICTIONNAIRES[locale]().then((module) => {
      if (actif) setDictionnaire({ locale, messages: module.default });
    });
    return () => {
      actif = false;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {dictionnaire && (
        <IntlProviderRacine locale={dictionnaire.locale} messages={dictionnaire.messages}>
          <Contenu digest={error.digest} retry={retry} />
        </IntlProviderRacine>
      )}
    </div>
  );
}

function Contenu({ digest, retry }: { readonly digest?: string; readonly retry: () => void }) {
  const t = useTranslations('errors.boundary');

  return (
    <>
      <BarreDeMarque />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="size-10 text-primary" aria-hidden />
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t('body')}</p>
        {digest && <p className="text-xs text-muted-foreground">{t('reference', { digest })}</p>}
        <Button onClick={retry}>{t('retry')}</Button>
      </main>
    </>
  );
}
