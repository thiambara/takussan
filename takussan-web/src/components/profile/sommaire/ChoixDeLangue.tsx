'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { useChangementDeLangue } from '@/hooks/useChangementDeLangue';
import { LOCALES, localeDisplayLabel, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

/**
 * TCK-2635 — la langue de l'interface, en section du profil (rangée « Langue » de la maquette). Le même
 * geste que le menu et la feuille du compte (`useChangementDeLangue`, TCK-2491) : un choix suffit,
 * sans « Enregistrer ».
 */
export function ChoixDeLangue() {
  const t = useTranslations('profile.sommaire');
  const locale = useLocale() as Locale;
  const langue = useChangementDeLangue({ remplacer: true });
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id} className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
      <p id={id} className="sr-only">
        {t('rangees.langue')}
      </p>
      {LOCALES.map((code) => {
        const courante = code === locale;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={courante}
            lang={code}
            disabled={langue.enCours}
            onClick={() => langue.choisir(code)}
            className={cn('flex min-h-12 w-full items-center gap-3 px-4 text-left text-corps disabled:opacity-60', courante && 'font-medium')}
          >
            <span className="min-w-0 flex-1">{localeDisplayLabel(code, code)}</span>
            {courante ? <Check className="size-icone flex-none text-primary" strokeWidth={2} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
