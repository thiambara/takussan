import { useTranslations } from 'next-intl';

import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ROUTES_LEGALES } from '@/lib/legal-routes';

import { MAILTO_AIDE } from './aide';

/**
 * TCK-2505 — le pied MINIMAL de la coque de lien : l'aide (le courriel de contact de l'éditeur, le
 * seul canal d'aide que le site déclare), la confidentialité, la langue. Rien de la marketplace.
 */
export function PiedDeLien() {
  const t = useTranslations('lienPublic.coque');
  return (
    <footer className="px-4 pb-8 pt-8 text-center text-[0.8125rem] leading-relaxed text-muted-foreground lg:pb-12">
      <p className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <a href={MAILTO_AIDE} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground">
          {t('aide')}
        </a>
        <span aria-hidden="true">·</span>
        <LienLocalise
          href={ROUTES_LEGALES.privacy}
          className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground"
        >
          {t('confidentialite')}
        </LienLocalise>
        <span aria-hidden="true">·</span>
        <LanguageSwitcher variant="labelled" className="ring-0 text-[0.8125rem] text-muted-foreground" />
      </p>
    </footer>
  );
}
