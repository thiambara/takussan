'use client';

import Link from 'next/link';
import { Rocket } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { useCan } from '@/hooks/useCan';
import { cn } from '@/lib/utils';
import { PARAMETRE_BOOSTER } from './parametre-booster';

export interface LienBoosterApresPublicationProps {
  readonly propertyId: number;
  /** Le libellé, déjà traduit par l'assistant : voir plus bas pourquoi ce composant ne traduit rien. */
  readonly libelle: string;
}

/**
 * TCK-633 (décision 5 du porteur, 2026-10-12) — « Booster » dans le message qui confirme la
 * publication. Ce message est un toast levé juste avant que l'assistant ne quitte la page, et il
 * se ferme seul : il ne peut pas porter le dialogue de boost, qui disparaîtrait avec lui. Le lien
 * mène donc à la fiche du bien avec `?booster=1`, où `BoostButton` ouvre le dialogue.
 *
 * Le toast vit dans la coque du tableau de bord, sous le client de requêtes : `useCan` y lit les
 * capacités comme ailleurs. Qui ne peut pas dépenser de crédits ne se voit rien proposer.
 *
 * ⚠ **Aucun `useTranslations` ici.** Le toast est rendu par le `<Toaster />` du layout
 * `(dashboard)`, sous le dictionnaire de CETTE frontière (`messagesPour('(dashboard)')`), pas sous
 * celui de la page qui l'a levé. `boost` n'y est pas : relevé au navigateur le 2026-10-12, le lien y
 * levait MISSING_MESSAGE, et la frontière d'erreur emportait tout le `<Toaster />` — le message de
 * publication disparaissait avec lui. L'assistant traduit donc le libellé et le passe.
 */
export function LienBoosterApresPublication({ propertyId, libelle }: LienBoosterApresPublicationProps) {
  const { can } = useCan('boost.spend');



  if (!can) return null;

  return (
    <Link
      href={`/app/properties/${propertyId}?${PARAMETRE_BOOSTER}=1`}
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
    >
      <Rocket aria-hidden="true" />
      {libelle}
    </Link>
  );
}
