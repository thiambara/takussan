import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Le bouton principal d'un écran d'entrée : posé SUR le clavier au téléphone (`decalage`, lu par
 * `useDecalageDuClavier`), dans le flux au bureau.
 *
 * ⚠ **Fixé, pas collant, au téléphone** (TCK-2604) : collant dans le formulaire, il suivait le
 * contenu et flottait au-dessus du clavier sur un écran court. Une cale de même hauteur (72 px)
 * garde dans le flux la place qu'il quitte : aucun contenu ne finit sous la barre.
 *
 * TCK-2606 — sorti de `ConnexionParTelephone` pour l'oubli et la voie e-mail. Posé sur le clavier,
 * 12 px sous le bouton ; sans clavier (« Lien envoyé », « Vérifiez votre adresse », un champ quitté),
 * 20 px — le pied de la maquette (`pb-5`, `pb-3` sur ses écrans à clavier). La cale suit (72 / 80 px).
 */
export function BoutonCollant({ decalage, className, children }: { readonly decalage: number; readonly className?: string; readonly children: ReactNode }) {
  const surLeClavier = decalage > 0;
  return (
    <>
      <div aria-hidden="true" className={cn('flex-none lg:hidden', surLeClavier ? 'h-18' : 'h-20', className)} />
      <div
        data-bouton-collant=""
        style={{ bottom: decalage }}
        className={cn(
          'z-20 max-lg:fixed max-lg:inset-x-0 max-lg:border-t max-lg:border-border max-lg:bg-card max-lg:px-4 max-lg:pt-3 max-lg:shadow-barre-collante',
          surLeClavier ? 'max-lg:pb-3' : 'max-lg:pb-5',
          className,
        )}
      >
        {/* La colonne de la coque (480 px) : à 768, le bouton ne déborde pas la colonne du formulaire. */}
        <div className="max-lg:mx-auto max-lg:max-w-[30rem]">{children}</div>
      </div>
    </>
  );
}

/** Le gabarit du bouton plein des écrans d'entrée (48 px, pilule) — celui de « Recevoir un code ». */
export const BOUTON_D_ENTREE =
  'h-12 w-full gap-2 rounded-full border-0 px-6 text-base font-semibold lg:text-action lg:leading-normal disabled:bg-foreground/8 disabled:text-muted-foreground disabled:opacity-100';
