import type { ReactNode } from 'react';

interface EnTeteDeRangeeProps {
  readonly eyebrow?: string;
  readonly title: string;
  /** `id` du `<h2>`, pour la section qui s'en fait nommer (`aria-labelledby`). */
  readonly idTitre?: string;
  /** Ce qui se pose à droite du titre : « Tout voir », flèches, action. */
  readonly children?: ReactNode;
}

/**
 * Le sur-titre et le titre d'une rangée de biens de l'accueil (`PropertyRow`).
 *
 * TCK-628 — resserré : 20/22 px au lieu de 24/30, 12 à 16 px sous le titre au lieu de 24. Les
 * titres de section de l'accueil en prenaient plus que les cartes qu'ils annonçaient.
 */
export function EnTeteDeRangee({ eyebrow, title, idTitre, children }: EnTeteDeRangeeProps) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 md:mb-4">
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </p>
        )}
        <h2 id={idTitre} className="font-display text-[20px] md:text-[22px] leading-[1.15] font-semibold tracking-tight text-foreground text-balance">
          {title}
        </h2>
      </div>

      {children ? <div className="flex shrink-0 items-center gap-3">{children}</div> : null}
    </div>
  );
}
