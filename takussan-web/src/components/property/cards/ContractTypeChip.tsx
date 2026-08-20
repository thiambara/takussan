import { useTranslations } from 'next-intl';

import type { ContractType } from '@/types/property';

interface ContractTypeChipProps {
  readonly type: ContractType;
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * Pastille « En vente / En location » unifiée — TCK-129.
 * Une seule source de vérité visuelle utilisée par toutes les variantes
 * de carte pour garantir cohérence couleur + typo + radius.
 */
export function ContractTypeChip({ type, compact = false, className }: ContractTypeChipProps) {
  const t = useTranslations('property.contractTypes');
  const isSale = type === 'sale';
  const sizing = compact
    ? 'px-2 py-0.5 text-[10px] gap-1'
    : 'px-2.5 py-1 text-[11px] gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold backdrop-blur-md ${sizing} ${
        isSale
          ? 'bg-foreground/85 text-background'
          : 'bg-accent/90 text-accent-foreground'
      } ${className || ''}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {compact
        ? t(isSale ? 'sale' : 'rent')
        : t(isSale ? 'saleLong' : 'rentLong')}
    </span>
  );
}
