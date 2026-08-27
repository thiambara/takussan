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
 * bandeau — fond ambre 50, encre ambre 950, anneau ambre 200 — au caractère près, chacun précédé
 * du même commentaire d'exception TCK-245 (« no `--warning` DS token available »). Un commentaire
 * d'exception recopié deux fois n'est pas une exception, c'est un jeton manquant.
 *
 * ⚠ **Ces trois classes étaient écrites ici EN TOUTES LETTRES jusqu'au 2026-08-27, et c'était le
 * dernier reste de palette brute du fichier.** Le RENDU (l. 28) était déjà sur les jetons depuis
 * TCK-358 ; c'est le RÉCIT de la migration qui citait encore les classes qu'il racontait avoir
 * éteintes — et `scripts/check-super-admin-tokens.mjs` lit les commentaires, délibérément. TCK-384
 * a donc porté zéro ligne de rendu dans ce fichier : il l'a compté à 3 défauts, et les 3 étaient
 * ici. *Un docblock qui montre une classe est la documentation périmée qui fait repousser le
 * motif* — même leçon que `components/console` chez TCK-358.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE CONTRASTE DU BANDEAU, MESURÉ (WCAG 2.1, 2026-08-27, TCK-384)
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'encre est `--warning` À PLEINE OPACITÉ sur un aplat du MÊME jeton à 10 % — ce n'est donc pas
 * `--warning-foreground` qui est rendu ici : ce jeton-là est l'encre du remplissage PLEIN
 * (`bg-warning`), que ce bandeau ne rend pas. Les deux thèmes, l'aplat étant à canal alpha, se
 * mesurent sur les deux surfaces où le bandeau se pose réellement :
 *
 *   clair   #8a5410 sur warning/10 aplati sur --card #ffffff .......... 5,42:1   (AA texte normal)
 *   clair   #8a5410 sur warning/10 aplati sur --background #fcf9f3 .... 5,19:1
 *   sombre  #e0a458 sur warning/10 aplati sur --card #2a2018 .......... 6,07:1
 *   sombre  #e0a458 sur warning/10 aplati sur --background #1f1812 .... 6,74:1
 *
 * L'anneau à 20 % n'est pas mesuré contre 1.4.11 : il double une frontière que le CHANGEMENT DE
 * FOND porte déjà, il ne porte aucune information à lui seul.
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
