import Link from 'next/link';
import { ListPlus } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { lienNouvelleTache, type GenreDeFiche } from '@/lib/taches/lien-nouvelle-tache';
import { cn } from '@/lib/utils';

/**
 * TCK-2857 — « Nouvelle tâche » d'une fiche (bien) : un lien vers « Tâches », le formulaire ouvert,
 * la fiche rattachée. Sans traduction ici : le libellé arrive de la page, ce lien pouvant être monté
 * par la coque (la feuille « ⋯ » du téléphone), hors des espaces de la page.
 */
export function LienNouvelleTache({ type, id, libelle, telephone = false }: { readonly type: GenreDeFiche; readonly id: number; readonly libelle: string; readonly telephone?: boolean }) {
  return (
    <Link
      href={lienNouvelleTache(type, id)}
      data-slot="nouvelle-tache"
      className={cn(buttonVariants({ variant: 'outline' }), telephone ? 'h-12 w-full justify-start gap-3' : 'gap-1.5')}
    >
      <ListPlus className={telephone ? 'size-5' : 'size-4'} aria-hidden="true" />
      {libelle}
    </Link>
  );
}
