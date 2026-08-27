import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type WarningBannerProps = ComponentPropsWithoutRef<'div'> & {
  icon?: ReactNode;
};

/**
 * L'UNIQUE bandeau d'avertissement inline du produit — le pendant non destructif de
 * `DestructiveBanner`, bâti sur le jeton `--warning` que TCK-358 pose dans `globals.css`.
 *
 * Il existe parce que son absence se recopiait : `/enums` et `/settings` portaient le même
 * `bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200` au caractère près, chacun
 * précédé du même commentaire d'exception TCK-245 (« no `--warning` DS token available »). Un
 * commentaire d'exception recopié deux fois n'est pas une exception, c'est un jeton manquant.
 *
 * ⚠ **Aucun `role` par défaut, et c'est délibéré** — contrairement à `DestructiveBanner` qui pose
 * `role="alert"`. Les deux appelants rendent un avis STATIQUE, présent au premier rendu : une
 * région live (`alert`/`status`) n'annonce rien à ce moment-là et se déclencherait ensuite à
 * chaque re-rendu, ce qui est pire que le silence. Un appelant dont l'avertissement APPARAÎT en
 * réaction à une action passe `role="alert"` explicitement.
 */
function WarningBanner({ className, children, icon, ...props }: WarningBannerProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning ring-1 ring-warning/20',
        className,
      )}
      {...props}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export { WarningBanner };
export type { WarningBannerProps };
