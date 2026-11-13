'use client';

import { useTranslations } from 'next-intl';
import { FlaskConical } from 'lucide-react';

import { WarningBanner } from '@/components/ui/warning-banner';
import { cn } from '@/lib/utils';

/**
 * TCK-620 (ADR-0060) — le code SMS qu'une préproduction (ou le poste local) rend dans sa réponse,
 * affiché à côté du champ où on le saisit. Ne rend rien sans code : en production, l'API n'en
 * rend jamais.
 */
interface CodeDePreproductionProps {
  readonly code: string | null | undefined;
  /** Remplit le champ du code. Sans lui, le code est seulement affiché. */
  readonly onUtiliser?: (code: string) => void;
  readonly className?: string;
  /**
   * TCK-2604 — `ligne` : la forme de la connexion (maquette `app-entree-connexion`, écran du code) —
   * une rangée de 55 px, l'étiquette en petites capitales, « Utiliser ce code » à droite. Le bandeau
   * reste la forme des autres écrans.
   */
  readonly forme?: 'bandeau' | 'ligne';
}

export function CodeDePreproduction({ code, onUtiliser, className, forme = 'bandeau' }: CodeDePreproductionProps) {
  const t = useTranslations('auth.otpPreview');
  if (!code) return null;

  if (forme === 'ligne') {
    return (
      <div
        role="status"
        data-testid="code-de-preproduction"
        className={cn('flex items-center gap-3 rounded-lg border border-dashed border-warning/45 bg-warning/8 px-3 py-2.5', className)}
      >
        <FlaskConical className="size-5 flex-none text-warning" strokeWidth={1.5} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-legende font-semibold uppercase leading-snug tracking-surtitre text-warning">{t('title')}</p>
          <p className="text-ui leading-snug">
            {t('body')} <strong className="font-semibold tabular-nums">{code}</strong>
          </p>
        </div>
        {onUtiliser ? (
          <button
            type="button"
            className="-my-3 inline-flex min-h-11 flex-none items-center rounded-lg text-ui font-medium text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
            onClick={() => onUtiliser(code)}
          >
            <span className="underline decoration-primary/40 underline-offset-4">{t('use')}</span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <WarningBanner
      role="status"
      icon={<FlaskConical className="size-4" aria-hidden />}
      className={className}
      data-testid="code-de-preproduction"
    >
      <p className="font-medium">{t('title')}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          {t('body')}{' '}
          <strong className="font-mono text-base tabular-nums tracking-widest">{code}</strong>
        </span>
        {onUtiliser ? (
          <button
            type="button"
            className="min-h-11 rounded-lg px-2 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
            onClick={() => onUtiliser(code)}
          >
            {t('use')}
          </button>
        ) : null}
      </p>
    </WarningBanner>
  );
}
