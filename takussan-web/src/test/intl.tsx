/**
 * Harnais i18n des tests — à utiliser dès qu'un composant sous test appelle `useTranslations`.
 *
 * `vitest.setup.ts` ne monte AUCUN `NextIntlClientProvider` : il ne polyfille que `ResizeObserver`
 * et `matchMedia`. Les tests qui en montaient un passaient souvent `messages={{}}`, ce qui fait
 * rendre la CLÉ à la place du libellé — donc tout `getByText('Mes visites')` casse à la seconde où
 * l'écran est traduit. Ce n'est pas un défaut du test : c'est de la plomberie que chaque lot de
 * TCK-286 paierait à nouveau s'il n'y avait pas ce fichier.
 *
 * Ici, le provider est alimenté par le VRAI `src/messages/fr.json`. Un test converti garde donc
 * ses assertions mot pour mot — et s'il rougit, c'est que le libellé a réellement changé à
 * l'écran, ce qui est exactement le signal qu'on veut.
 */
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { TIMEZONE } from '@/i18n/config';

const DICTIONNAIRES = { fr, en, wo } as const;

export type LocaleDeTest = keyof typeof DICTIONNAIRES;

type Arbre = Record<string, unknown>;

/** Même deep-merge qu'en production (`src/i18n/request.ts`) : `fr` sert de repli sous les autres. */
function fusionne(base: Arbre, surcharge: Arbre): Arbre {
  const sortie: Arbre = { ...base };
  for (const [cle, valeur] of Object.entries(surcharge)) {
    const existant = sortie[cle];
    if (
      valeur && typeof valeur === 'object' && !Array.isArray(valeur)
      && existant && typeof existant === 'object' && !Array.isArray(existant)
    ) {
      sortie[cle] = fusionne(existant as Arbre, valeur as Arbre);
    } else {
      sortie[cle] = valeur;
    }
  }
  return sortie;
}

/**
 * Enveloppe `ui` dans un `NextIntlClientProvider` chargé des vrais dictionnaires.
 *
 * ```tsx
 * render(withIntl(<AppTopbar user={user} />));
 * render(withIntl(<AppTopbar user={user} />, 'en'));   // pour vérifier une traduction anglaise
 * ```
 */
export function withIntl(ui: ReactNode, locale: LocaleDeTest = 'fr') {
  const messages = locale === 'fr'
    ? (fr as Arbre)
    : fusionne(fr as Arbre, DICTIONNAIRES[locale] as Arbre);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={TIMEZONE} now={new Date()}>
      {ui}
    </NextIntlClientProvider>
  );
}

/**
 * Équivalent de {@link withIntl} pour les composants SERVEUR, qui appellent `getTranslations` de
 * `next-intl/server` au lieu d'un hook.
 *
 * Aucun provider ne peut les couvrir : `getTranslations` résout la locale par `next/headers`, qui
 * n'existe pas sous jsdom. Le test doit donc remplacer le module :
 *
 * ```ts
 * vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
 * ```
 *
 * Le mock lit le VRAI `fr.json` — un libellé absent rend sa clé, ce qui fait rougir l'assertion
 * au lieu de rendre une chaîne vide qui passerait inaperçue.
 */
export function mockTraductionsServeur() {
  const resous = (chemin: string): string => {
    const valeur = chemin.split('.').reduce<unknown>(
      (noeud, cle) => (noeud && typeof noeud === 'object'
        ? (noeud as Record<string, unknown>)[cle]
        : undefined),
      fr,
    );
    return typeof valeur === 'string' ? valeur : chemin;
  };
  return {
    getTranslations: async (namespace?: string) =>
      (cle: string) => resous(namespace ? `${namespace}.${cle}` : cle),
    getLocale: async () => 'fr',
    getMessages: async () => fr,
  };
}
