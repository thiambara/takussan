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
 *
 * ⚠ **`bg-foreground/85` n'est PAS un voile, et ne doit pas devenir `bg-scrim/85`.**
 * La liste de conversion de TCK-440 comptait six sites ; la dérivation faite à l'intégration
 * (2026-08-28) en a rendu dix, et le tri a retiré celui-ci. Un voile assombrit un média et reste
 * sombre dans les deux thèmes ; cette pastille est une SURFACE qui s'inverse avec son texte —
 * `bg-foreground/85 text-background` forme une paire, et la paire est ce qui la rend lisible :
 *
 *     clair  : fond #1f1812 à 85 %  ·  texte #fcf9f3   → lisible
 *     sombre : fond #fcf9f3 à 85 %  ·  texte #1f1812   → lisible
 *
 * `--scrim` ne s'inverse pas (déclaré une seule fois, jamais sous `.dark`). La convertir donnerait
 * en thème sombre un fond noir sous un texte #1f1812 — **illisible**. *Une liste de sites énumérée
 * à la main range ensemble ce qui se ressemble à l'œil, pas ce qui se comporte pareil.*
 *
 * Corroboré indépendamment par TCK-458, ouvert le même jour sur ce fichier : la paire mesure
 * **10,5 à 12,4:1** selon le fond, très au-dessus du seuil AA. C'est l'AUTRE variante — la
 * location, `bg-accent/90 text-accent-foreground`, 4,22 à 4,29:1 — qui est en défaut. Deux
 * raisonnements partis d'endroits opposés désignent la même ligne : celle-ci n'est pas à toucher.
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
