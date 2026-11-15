'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-2505 — copier une valeur d'un geste (numéro Wave, RIB, référence). Le libellé passe à
 * « Copié » deux secondes ; le nom accessible dit CE qu'on copie.
 */
export function BoutonCopier({
  valeur,
  quoi,
  avecLibelle = false,
  className,
}: {
  readonly valeur: string;
  readonly quoi: string;
  readonly avecLibelle?: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('lienPublic.coque');
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    if (!copie) return;
    const minuteur = window.setTimeout(() => setCopie(false), 2000);
    return () => window.clearTimeout(minuteur);
  }, [copie]);

  async function copier() {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(true);
    } catch {
      // Presse-papiers refusé (contexte non sûr, permission) : la valeur reste lisible et sélectionnable.
    }
  }

  const Icone = copie ? Check : Copy;
  return (
    <button
      type="button"
      onClick={() => void copier()}
      aria-label={t('copierQuoi', { quoi })}
      className={cn(
        'inline-flex min-h-11 min-w-11 flex-none items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icone className="size-4" aria-hidden="true" />
      {avecLibelle ? <span aria-hidden="true">{copie ? t('copie') : t('copier')}</span> : null}
      <span className="sr-only" role="status">
        {copie ? t('copie') : ''}
      </span>
    </button>
  );
}
