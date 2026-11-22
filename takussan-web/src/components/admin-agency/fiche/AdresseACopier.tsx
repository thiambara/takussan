'use client';

import { useId, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * TCK-2670 — l'adresse de la fiche publique, en lecture seule, et son bouton « Copier ». L'identifiant
 * (`slug`) ne se modifie pas : vos annonces partagées y mènent (TCK-1004).
 */
export function AdresseACopier({
  libelle,
  adresse,
  aide,
  className,
}: {
  readonly libelle: string;
  readonly adresse: string;
  readonly aide?: string;
  readonly className?: string;
}) {
  const t = useTranslations('admin.agencyConfig.fiche');
  const id = useId();
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

  return (
    <div className={className}>
      <p id={`${id}-libelle`} className="mb-1.5 text-sm font-medium">
        {libelle}
      </p>
      <div
        className="flex h-11 items-center rounded-lg border border-border bg-card pl-3 text-corps"
        role="group"
        aria-labelledby={`${id}-libelle`}
      >
        <span className="min-w-0 flex-1 truncate" data-testid="adresse-publique">
          {adresse}
        </span>
        <button
          type="button"
          onClick={() => void copier()}
          className={cn(
            'inline-flex h-full flex-none items-center gap-1.5 rounded-r-lg px-3 text-ui text-muted-foreground transition-colors hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label={t('copierLAdresse')}
        >
          {copiee ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          <span className="max-md:hidden">{copiee ? t('copiee') : t('copier')}</span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copiee ? t('adresseCopiee') : ''}
      </span>
      {aide ? <p className="mt-1 text-pretty text-xs text-muted-foreground">{aide}</p> : null}
    </div>
  );
}
