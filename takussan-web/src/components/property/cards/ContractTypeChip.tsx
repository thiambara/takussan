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
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-628 — UNE PLAQUE CLAIRE, ET LA TRANSACTION DANS LE POINT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Retour du porteur, comparant l'accueil à celui d'Airbnb : les pastilles « En vente » (encre à
 * 85 %) et « En location » (sauge pleine) étaient « de gros pavés sombres » posés sur la photo.
 * Elles deviennent la plaque d'Airbnb : `bg-card text-foreground`, opaque, à ombre légère — la
 * même que `NewBuildChip` —, et la transaction se lit dans le POINT : terracotta pour la vente,
 * sauge pour la location.
 *
 * Le contraste n'y perd rien, il y gagne en simplicité : une plaque OPAQUE ne dépend plus de la
 * photo (c'était tout l'objet de TCK-458, qui avait dû retirer l'alpha de la variante location),
 * et la paire carte / encre est celle du corps de page, mesurée dans les deux thèmes par
 * `surface-publique.contraste.test.ts` (AC1). Le point n'est pas du texte :
 * il double l'information du libellé, il ne la porte pas seul (WCAG 1.4.1).
 *
 * L'historique des deux plaques sombres — et de leurs mesures, 10,5 à 12,4:1 pour la vente,
 * 4,22:1 puis 5,25:1 pour la location — est dans TCK-440 et TCK-458.
 */
export function ContractTypeChip({ type, compact = false, className }: ContractTypeChipProps) {
  const t = useTranslations('property.contractTypes');
  const isSale = type === 'sale';
  const sizing = compact
    ? 'px-2 py-0.5 text-xs gap-1'
    : 'px-2.5 py-1 text-xs gap-1.5';

  // `max-w-full` + libellé `truncate` : dernier recours quand la place manque même pour UNE
  // pastille — elle se tronque au lieu de passer sous le cœur de la carte.
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center rounded-full font-semibold bg-card text-foreground shadow-sm ${sizing} ${className || ''}`}
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${isSale ? 'bg-primary' : 'bg-accent'}`} />
      {/* Le libellé est le MÊME à toutes les tailles — `compact` ne règle que le gabarit. Il
          valait « Vente / Location » en compact et « En vente / En location » sinon : sur
          l'accueil, deux rangées voisines disaient la même chose de deux façons (revue du
          2026-09-28). La forme LONGUE l'emporte : c'est le mot que les puces de transaction de la
          barre de filtres reprennent (TCK-552), et la carte de la liste des biens le porte. */}
      <span className="truncate">{t(isSale ? 'saleLong' : 'rentLong')}</span>
    </span>
  );
}
