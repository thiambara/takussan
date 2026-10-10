import { Fragment } from 'react';
import { cn } from '@/lib/utils';

/**
 * Un élément montré à certaines largeurs seulement (TCK-555) : `className` porte la classe qui le
 * masque (`md:hidden`). Sous `md`, la carte de liste dit l'ancienneté et l'état « Neuf » dans sa
 * ligne de détails ; au-delà, ils restent sur la photo, comme avant.
 */
export interface ElementDeMetaConditionnel {
  readonly texte: string;
  readonly className: string;
}

type ElementDeMeta = string | ElementDeMetaConditionnel;

interface CardMetaProps {
  /** Les éléments absents (`null`, `false`, chaîne vide) sont écartés AVANT de poser les points. */
  readonly items: readonly (ElementDeMeta | null | false | undefined)[];
  readonly className?: string;
  /**
   * Une seule ligne, tronquée par « … » au lieu de passer à la ligne. Les cartes des rangées de
   * l'accueil la demandent : à sept par rangée (160 px dès 1264 px d'écran), « 2 ch • 142 m² • il y a
   * 2 mois » passait sur deux lignes sur une carte sur deux, et les prix ne s'alignaient plus d'une
   * carte à l'autre (relevé le 2026-10-10).
   */
  readonly uneLigne?: boolean;
}

/**
 * La ligne de méta d'une carte (« 3 ch • 95 m² • 2 sdb »).
 *
 * Chaque variante posait ses séparateurs à la main, collés à un élément : un bien sans chambre
 * rendait « • 143 m² » (point en tête) et un bien sans surface « 3 ch • » (point en queue).
 * Mesuré sur l'accueil le 2026-09-16. Le séparateur ne se pose plus qu'ENTRE deux éléments présents.
 *
 * TCK-555 — et il le reste à chaque largeur. Le séparateur qui précède un élément conditionnel
 * disparaît avec lui ; celui qui précède le premier élément TOUJOURS montré, quand seuls des
 * éléments conditionnels le précèdent, disparaît avec eux — sinon la ligne s'ouvrirait sur une puce
 * aux largeurs où ils sont masqués. (Les éléments conditionnels d'une même ligne partagent une
 * même classe : c'est le seul cas que la carte produit.)
 */
export function CardMeta({ items, className, uneLigne = false }: CardMetaProps) {
  const presents = items
    .filter((item): item is ElementDeMeta => (typeof item === 'string' ? item !== '' : Boolean(item && item.texte)))
    .map((item) => (typeof item === 'string' ? { texte: item, className: undefined } : item));
  if (presents.length === 0) return null;

  return (
    // `uneLigne` : un bloc de texte et non une boîte flexible — c'est ce qui laisse `truncate` poser
    // son « … » en fin de ligne ; les puces prennent alors leur écart en marges.
    <div
      className={cn(
        uneLigne ? 'truncate tabular-nums' : 'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums',
        className,
      )}
      // Le texte rogné reste lisible au survol ; un lecteur d'écran lit la ligne entière de toute façon.
      title={uneLigne ? presents.map((p) => p.texte).join(' • ') : undefined}
    >
      {presents.map((item, i) => {
        const precedentsConditionnels = presents.slice(0, i).every((p) => p.className);
        const classeDuSeparateur = item.className ?? (precedentsConditionnels ? presents[i - 1]?.className : undefined);
        return (
          <Fragment key={`${i}-${item.texte}`}>
            {i > 0 && (
              <span aria-hidden="true" className={cn('text-muted-foreground/50', uneLigne && 'mx-1.5', classeDuSeparateur)}>
                •
              </span>
            )}
            <span className={item.className}>{item.texte}</span>
          </Fragment>
        );
      })}
    </div>
  );
}
