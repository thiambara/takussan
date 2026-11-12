'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * TCK-2670 — l'adresse de la fiche publique sous le nom de l'agence (en-tête du bureau, sommaire du
 * téléphone), et son bouton « Copier ». `grande` : le bouton bordé de 32 px du téléphone.
 */
export function AdresseEnLigne({ adresse, grande = false, className }: { readonly adresse: string; readonly grande?: boolean; readonly className?: string }) {
  const t = useTranslations('admin.agencyConfig.fiche');
  const [copiee, setCopiee] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(`https://${adresse}`);
      setCopiee(true);
      window.setTimeout(() => setCopiee(false), 2000);
    } catch {
      setCopiee(false);
    }
  }

  const Icone = copiee ? Check : Copy;
  return (
    <span className={cn('flex min-w-0 items-center gap-2 text-ui text-muted-foreground', className)}>
      <span className="truncate">{adresse}</span>
      <button
        type="button"
        onClick={() => void copier()}
        aria-label={t('copierLAdresse')}
        className={cn(
          'inline-flex flex-none items-center justify-center text-encre-douce transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          grande ? 'size-8 rounded-md border border-border bg-card' : 'size-6 rounded',
        )}
      >
        <Icone className={cn(grande ? 'size-4' : 'size-3.5', copiee && 'text-success')} aria-hidden="true" />
      </button>
      <span className="sr-only" aria-live="polite">
        {copiee ? t('adresseCopiee') : ''}
      </span>
    </span>
  );
}
