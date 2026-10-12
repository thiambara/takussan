'use client';

import { useTranslations } from 'next-intl';
import { FlaskConical } from 'lucide-react';

import { WarningBanner } from '@/components/ui/warning-banner';

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
}

export function CodeDePreproduction({ code, onUtiliser, className }: CodeDePreproductionProps) {
  const t = useTranslations('auth.otpPreview');
  if (!code) return null;

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
            className="min-h-11 rounded-lg px-2 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => onUtiliser(code)}
          >
            {t('use')}
          </button>
        ) : null}
      </p>
    </WarningBanner>
  );
}
