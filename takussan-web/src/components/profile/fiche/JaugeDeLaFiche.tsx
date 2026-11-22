'use client';

import { useLocale, useTranslations } from 'next-intl';

import { ceQuIlReste, type CompletudeDeLaFiche } from '@/lib/profil/completude-de-la-fiche';
import { cn } from '@/lib/utils';

/**
 * TCK-2862 — la jauge de la fiche publique (maquette `JaugeFiche`) : « 60 % complète », la barre, et ce
 * qu'il reste à remplir. À 100 %, la jauge dit que la fiche est complète, sans « il vous reste ».
 * Le pourcentage vient de `completudeDeLaFiche`, le calcul du sommaire.
 */
export function JaugeDeLaFiche({ completude, className }: { readonly completude: CompletudeDeLaFiche; readonly className?: string }) {
  const t = useTranslations('profile.completude');
  const tManque = useTranslations('profile.completude.manque');
  const locale = useLocale();
  const { pourcentage, manquants } = completude;
  return (
    <div data-slot="jauge-de-la-fiche" className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-baseline gap-2">
        <p className="font-display text-2xl font-semibold tabular-nums tracking-titre">{t('pourcentage', { pourcentage })}</p>
        <p className="text-sm font-medium">{t('complete')}</p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={t('barre')}
        aria-valuenow={pourcentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pourcentage}%` }} />
      </div>
      <p className="mt-2.5 text-ui leading-snug text-muted-foreground" aria-live="polite">
        {manquants.length === 0
          ? t('faite')
          : `${t('invitation')} ${t('reste', { reste: ceQuIlReste(manquants, (c, v) => tManque(c, v), locale) })}`}
      </p>
    </div>
  );
}
