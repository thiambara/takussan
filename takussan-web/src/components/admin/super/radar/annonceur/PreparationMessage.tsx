'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RADAR_MESSAGE_LOCALES, type RadarMessageLocale } from '@/types/radar';

interface PreparationMessageProps {
  readonly nbAnnonces: number;
  readonly locale: RadarMessageLocale;
  readonly onLocale: (locale: RadarMessageLocale) => void;
  readonly onPreparer: () => void;
  readonly desactive: boolean;
  readonly enCours: boolean;
}

/**
 * TCK-2388 — la langue du message (français par défaut, anglais ; le wolof est en pause) et le geste qui le
 * prépare : l'API compose le texte, ce panneau n'en écrit pas un mot.
 */
export function PreparationMessage({ nbAnnonces, locale, onLocale, onPreparer, desactive, enCours }: PreparationMessageProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.prepare');
  const nom = useId();

  return (
    <section aria-label={t('heading')} className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-annonceur-preparer">
      <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
      <fieldset className="space-y-1.5" disabled={desactive}>
        <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('locale')}</legend>
        <div className="flex flex-wrap gap-2">
          {RADAR_MESSAGE_LOCALES.map((code) => (
            <label
              key={code}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              )}
            >
              <input
                type="radio"
                name={nom}
                value={code}
                checked={locale === code}
                onChange={() => onLocale(code)}
                className="accent-primary"
              />
              {t(`locales.${code}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={desactive || enCours || nbAnnonces === 0} onClick={onPreparer}>
          {enCours ? t('preparing') : t('action')}
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">{t('selected', { count: nbAnnonces })}</p>
      </div>
    </section>
  );
}
