'use client';

import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console/StatusBadge';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { etatEcheance } from '@/lib/kyc-echeance';
import { cn } from '@/lib/utils';

interface KycEcheanceProps {
  /** `YYYY-MM-DD` (pièce) ou ISO 8601 (dossier) ; rien n'est rendu sans valeur. */
  readonly value: string | null | undefined;
  /** `document` : « Expire le … » ; `dossier` : « Vérification valable jusqu'au … ». */
  readonly kind?: 'document' | 'dossier';
  readonly className?: string;
}

/**
 * TCK-601 (C) — l'échéance d'une pièce KYC ou d'un dossier vérifié, lisible au premier regard.
 *
 * Direction UX du ticket : la date est visible ; une échéance proche se SIGNALE sans alarmer
 * (`attention`) ; une échéance passée se lit comme un état à traiter (`danger`). Une échéance
 * lointaine reste du texte discret — une pastille sur chaque pièce saine serait du bruit.
 * Les seuils vivent dans `etatEcheance` (`@/lib/kyc-echeance`).
 */
export function KycEcheance({ value, kind = 'document', className }: KycEcheanceProps) {
  const t = useTranslations('kyc.expiry');
  const fmt = useFormatteurs();
  const etat = etatEcheance(value);
  if (!value || etat === null) return null;

  const date = fmt.date(value);

  if (etat === 'expired') {
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)} data-testid="kyc-echeance-expired">
        <StatusBadge tone="danger" label={t('expiredBadge')} />
        <span className="text-xs text-destructive">{t('expiredOn', { date })}</span>
      </span>
    );
  }

  if (etat === 'soon') {
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)} data-testid="kyc-echeance-soon">
        <StatusBadge tone="attention" label={t('soonBadge')} />
        <span className="text-xs text-muted-foreground">
          {kind === 'dossier' ? t('dossierValidUntil', { date }) : t('expiresOn', { date })}
        </span>
      </span>
    );
  }

  return (
    <span className={cn('inline-block text-xs text-muted-foreground', className)} data-testid="kyc-echeance-valid">
      {kind === 'dossier' ? t('dossierValidUntil', { date }) : t('expiresOn', { date })}
    </span>
  );
}
