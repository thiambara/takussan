'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MarquesDeBoostProps {
  readonly featured?: boolean;
  readonly badge?: unknown;
  readonly className?: string;
}

/**
 * TCK-633 lot F (ADR-0061 §5, §7) — « En vedette » (l'accent des badges featured, pas le primaire
 * des CTA : `docs/design-guidelines.md`) et le badge acheté. Un résultat payé ne se présente jamais
 * comme un résultat organique.
 */
export function MarquesDeBoost({ featured = false, badge, className }: MarquesDeBoostProps) {
  const t = useTranslations('boost.marks');
  const variante = badge === 'urgent' || badge === 'price_drop' ? badge : null;
  if (!featured && variante === null) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {featured ? <Badge variant="default" className="bg-accent text-accent-foreground">{t('featured')}</Badge> : null}
      {variante ? <Badge variant="secondary">{t(variante === 'urgent' ? 'urgent' : 'priceDrop')}</Badge> : null}
    </div>
  );
}
