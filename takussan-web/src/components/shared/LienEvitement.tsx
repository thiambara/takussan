'use client';

import { useTranslations } from 'next-intl';

import { CONTENU_PRINCIPAL_ID } from './contenu-principal';

interface LienEvitementProps {
  /** L'`id` du `<main>` visé ; la console super-admin garde le sien. */
  readonly cible?: string;
}

/**
 * « Aller au contenu principal » — masqué tant qu'il n'a pas le focus, premier élément
 * focalisable de la coque qui le monte (TCK-359 pour la console, TCK-905 ailleurs).
 *
 * ⚠ Le `onClick` n'est PAS une redondance du `href`. La navigation par fragment ne déplace le
 * focus que sur une cible focalisable — d'où le `tabIndex={-1}` sur `<main>` — et Safari ne le
 * déplace pas du tout. Le handler rend le comportement identique partout, et c'est aussi lui qui
 * rend le comportement vérifiable sous jsdom, qui n'implémente aucune navigation par fragment.
 */
export function LienEvitement({ cible = CONTENU_PRINCIPAL_ID }: LienEvitementProps) {
  const t = useTranslations('common');
  return (
    <a
      href={`#${cible}`}
      onClick={() => {
        document.getElementById(cible)?.focus();
      }}
      className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {t('skipToContent')}
    </a>
  );
}
