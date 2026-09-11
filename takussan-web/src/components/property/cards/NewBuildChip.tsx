import { useTranslations } from 'next-intl';

import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { newBuildConditionValues } from '@/lib/schemas/property';
import type { PropertyCondition } from '@/types/property';

type EtatNeuf = (typeof newBuildConditionValues)[number];

/**
 * TCK-508 — seuls « Neuf » et « Sur plan » méritent un badge : ce sont des arguments de vente.
 * « À rénover » posé sur une photo de carte serait un repoussoir, pas une information ; les trois
 * autres états ne figurent que dans les caractéristiques de la fiche.
 */
export function porteUnBadgeNeuf(
  condition: PropertyCondition | null | undefined,
): condition is EtatNeuf {
  return condition != null && (newBuildConditionValues as readonly string[]).includes(condition);
}

interface NewBuildChipProps {
  readonly condition: PropertyCondition | null | undefined;
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * Pastille « Neuf / Sur plan », posée à côté de `ContractTypeChip` sur les cartes publiques.
 *
 * ⚠ Plaque OPAQUE `bg-card text-foreground`, et c'est délibéré : un fond semi-transparent posé sur
 * une photo n'a pas de contraste garanti (cf. la variante *location* de `ContractTypeChip`,
 * TCK-458). La paire carte / encre s'inverse avec le thème, elle reste donc lisible dans les
 * deux — et elle ne crée aucune couleur nouvelle.
 */
export function NewBuildChip({ condition, compact = false, className }: NewBuildChipProps) {
  const t = useTranslations(PROPERTY_ENUM_NAMESPACES.condition);
  if (!porteUnBadgeNeuf(condition)) return null;

  const sizing = compact
    ? 'px-2 py-0.5 text-[10px] gap-1'
    : 'px-2.5 py-1 text-[11px] gap-1.5';

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center rounded-full font-semibold bg-card text-foreground shadow-sm ${sizing} ${className || ''}`}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
      {/* Tronqué plutôt que sous le cœur quand la place manque — cf. ContractTypeChip. */}
      <span className="truncate">{t(condition)}</span>
    </span>
  );
}
