'use client';
import { useTranslations } from 'next-intl';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ROUTES_LEGALES } from '@/lib/legal-routes';

/**
 * TCK-590 — la mention d'information des formulaires sans compte : une ligne discrète et un
 * lien vers la politique de confidentialité, sans case à cocher. Le visiteur laisse un numéro à
 * un inconnu ; il doit savoir à quoi il servira.
 */
export function MentionDeConfidentialite() {
  const t = useTranslations('propertyContact.privacy');
  return (
    <p className="text-xs text-muted-foreground">
      {t('notice')}{' '}
      <LienLocalise href={ROUTES_LEGALES.privacy} className="underline underline-offset-2 hover:text-foreground">
        {t('link')}
      </LienLocalise>
    </p>
  );
}
