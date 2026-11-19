'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export type OngletDeLaMessagerie = 'conversations' | 'engagements';

/**
 * TCK-2973 (maquette `fil-engagements` A) — « Conversations · Engagements », en tête de la colonne de la
 * liste. Le compte de l'onglet n'est pas posé : il demanderait une seconde requête à chaque écran de la
 * messagerie, et les puces de l'onglet portent déjà les leurs (`meta.counts`).
 */
export function OngletsDeLaMessagerie({ onglet, onChange }: { readonly onglet: OngletDeLaMessagerie; readonly onChange: (o: OngletDeLaMessagerie) => void }) {
  const t = useTranslations('messaging.engagements.onglet');
  return (
    <div role="tablist" aria-label={t('onglets')} className="flex flex-none gap-1 border-b border-border px-4">
      {(['conversations', 'engagements'] as const).map((o) => (
        <button
          key={o}
          type="button"
          role="tab"
          aria-selected={onglet === o}
          onClick={() => onChange(o)}
          className={cn(
            '-mb-px min-h-11 border-b-2 px-2 text-ui font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
            onglet === o ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t(o)}
        </button>
      ))}
    </div>
  );
}
