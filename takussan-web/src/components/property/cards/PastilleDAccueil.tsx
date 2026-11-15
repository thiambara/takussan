'use client';

import { ContractTypeChip } from './ContractTypeChip';
import { NewBuildChip } from './NewBuildChip';
import { ActionsSurPhoto } from './ActionsSurPhoto';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-2495 — ce que porte la photo d'une carte d'ACCUEIL (`allegee`) : une pastille et le favori,
 * rien d'autre. L'audit comptait quatre à six éléments par photo (transaction, « neuf », favori,
 * comparateur, ruban) ; l'AC3 en tolère deux. Le comparateur sort des cartes de l'accueil : il reste
 * sur la liste et sur la fiche.
 *
 * La pastille unique : la transaction, sinon l'état « neuf ». Une carte en robe « En vedette » n'en
 * porte aucune : le ruban EST sa pastille (`PropertyCardCover`).
 */
export function PastilleEtFavoriDAccueil({
  property,
  robe,
}: {
  readonly property: PropertyListItem;
  readonly robe?: 'vedette';
}) {
  return (
    <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center">
        {robe ? null : property.contract_type ? (
          <ContractTypeChip type={property.contract_type} compact />
        ) : (
          <NewBuildChip condition={property.condition} compact />
        )}
      </div>
      <ActionsSurPhoto property={property} comparateur={false} />
    </div>
  );
}
