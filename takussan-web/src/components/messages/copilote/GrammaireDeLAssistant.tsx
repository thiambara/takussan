'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * TCK-2977 (ADR-0131 § 5) — LA grammaire de « proposé, non envoyé », pour tout ce que le copilote montre (ce
 * ticket et TCK-2978) : une bordure en tirets, l'aplat beige du chrome, l'étiquette « ✦ … de l'assistant » en
 * toutes lettres, et la ligne « Visible par vous seulement · rien n'est envoyé ». Jamais le style d'une bulle
 * envoyée, jamais la couleur seule. Maquette `fil-copilote` A (`CadreIA`, `MarqueIA`, `PourVousSeule`, `Avis`).
 */

/** L'étiquette « ✦ … » : le texte dit TOUJOURS que c'est l'assistant. */
export function MarqueDeLAssistant({ texte, className }: { readonly texte: string; readonly className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold text-primary-deep', className)} data-testid="marque-assistant">
      <Sparkles className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
      {texte}
    </span>
  );
}

/** Le cadre de tout ce que l'assistant propose : tirets, aplat de chrome. Jamais une bulle. */
export function CadreDeLAssistant({
  children,
  pied,
  className,
  ...reste
}: {
  readonly children: ReactNode;
  readonly pied?: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-dashed border-primary/50 bg-secondary/45', className)} data-proposition-de-l-assistant="" {...reste}>
      <div className="p-3.5">{children}</div>
      {pied ? <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-primary/30 px-3.5 py-2.5">{pied}</div> : null}
    </div>
  );
}

/** « Visible par vous seulement · rien n'est envoyé » — forme neutre (la maquette écrit « vous seule »). */
export function PourVousSeulement() {
  const t = useTranslations('messaging.copilote');
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Lock className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
      {t('pourVousSeul')}
    </p>
  );
}

/**
 * « Utile / Pas utile » : décide la suggestion (`accepted` / `rejected`). Une fois l'avis donné, les deux
 * boutons laissent place à un merci : une décision ne se prend qu'une fois (`SuggestionRecorder`).
 */
export function AvisSurLaProposition({
  onAvis,
  donne,
  enCours = false,
}: {
  readonly onAvis: (avis: 'accepted' | 'rejected') => void;
  readonly donne: boolean;
  readonly enCours?: boolean;
}) {
  const t = useTranslations('messaging.copilote');
  if (donne) {
    return (
      <span role="status" className="ml-auto text-xs text-muted-foreground">
        {t('merci')}
      </span>
    );
  }
  const bouton =
    'inline-flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60';
  return (
    <span className="ml-auto flex items-center gap-0.5">
      <button type="button" aria-label={t('utile')} disabled={enCours} onClick={() => onAvis('accepted')} className={bouton}>
        <ThumbsUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button type="button" aria-label={t('pasUtile')} disabled={enCours} onClick={() => onAvis('rejected')} className={bouton}>
        <ThumbsDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </span>
  );
}
