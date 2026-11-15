'use client';

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  COINS,
  deplacerLeCoin,
  dimensionsTournees,
  PAS_DU_CLAVIER,
  placerLeCoin,
  positionDuCoin,
  type Cadre,
  type Coin,
} from '@/lib/documents/recadrage';
import { cn } from '@/lib/utils';

/**
 * TCK-2898 — l'étape « Redresser et recadrer » de l'ajout au coffre, après la prise de la photo
 * (maquette `app-documents` a, e1) : la photo, tournée par quarts de tour (« Tourner »), et un cadre
 * dont chacun des quatre coins se déplace au doigt, à la souris ou aux flèches du clavier. Contrôlé :
 * le parent tient la rotation et le cadre, et produit le fichier ({@link recadrerLaPhoto}).
 *
 * Le cadre est en fractions de l'image tournée ; tourner repart du cadre entier.
 */

export interface RecadrageProps {
  /** L'URL `blob:` de la photo, ou `null` (l'environnement n'en crée pas) : le cadre reste réglable. */
  readonly apercu: string | null;
  /** Les dimensions de la photo, lues au décodage. */
  readonly naturel: { readonly largeur: number; readonly hauteur: number };
  readonly quarts: number;
  readonly cadre: Cadre;
  readonly onTourner: () => void;
  readonly onCadre: (cadre: Cadre) => void;
  readonly onReprendre?: () => void;
}

const FLECHES: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const pourcent = (v: number) => `${v * 100}%`;

export function Recadrage({ apercu, naturel, quarts, cadre, onTourner, onCadre, onReprendre }: RecadrageProps) {
  const t = useTranslations('documents.coffre.ajout.recadrage');
  const zone = useRef<HTMLDivElement>(null);
  const tourne = dimensionsTournees(naturel.largeur, naturel.hauteur, quarts);
  const ratio = tourne.largeur / tourne.hauteur;
  const impair = quarts % 2 === 1;

  // L'image garde ses proportions d'origine et tourne autour de son centre, dans une zone aux
  // proportions de l'image TOURNÉE.
  const styleImage: CSSProperties = {
    width: impair ? pourcent(naturel.largeur / naturel.hauteur) : '100%',
    height: impair ? pourcent(naturel.hauteur / naturel.largeur) : '100%',
    transform: `translate(-50%, -50%) rotate(${quarts * 90}deg)`,
  };

  const auClavier = (coin: Coin) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const fleche = FLECHES[e.key];
    if (!fleche) return;
    e.preventDefault();
    onCadre(deplacerLeCoin(cadre, coin, fleche[0] * PAS_DU_CLAVIER, fleche[1] * PAS_DU_CLAVIER));
  };

  const auPointeur = (coin: Coin) => (e: PointerEvent<HTMLButtonElement>) => {
    const rect = zone.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    onCadre(placerLeCoin(cadre, coin, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height));
  };

  return (
    <div className="space-y-3">
      <p className="text-ui leading-snug text-muted-foreground">{t('aide')}</p>
      <div
        ref={zone}
        data-testid="zone-de-recadrage"
        className="relative mx-auto touch-none overflow-hidden rounded-lg bg-foreground"
        style={{ aspectRatio: `${tourne.largeur} / ${tourne.hauteur}`, width: `min(100%, calc(55dvh * ${ratio}))` }}
      >
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element -- une URL `blob:` locale, que `next/image` n'optimise pas.
          <img src={apercu} alt="" draggable={false} className="absolute top-1/2 left-1/2 max-w-none select-none" style={styleImage} />
        ) : null}
        {/* Le voile hors du cadre : quatre bandes. */}
        <span aria-hidden="true" className="absolute inset-x-0 top-0 bg-foreground/55" style={{ height: pourcent(cadre.y) }} />
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-foreground/55" style={{ height: pourcent(1 - cadre.y - cadre.hauteur) }} />
        <span
          aria-hidden="true"
          className="absolute left-0 bg-foreground/55"
          style={{ top: pourcent(cadre.y), height: pourcent(cadre.hauteur), width: pourcent(cadre.x) }}
        />
        <span
          aria-hidden="true"
          className="absolute right-0 bg-foreground/55"
          style={{ top: pourcent(cadre.y), height: pourcent(cadre.hauteur), width: pourcent(1 - cadre.x - cadre.largeur) }}
        />
        <span
          aria-hidden="true"
          data-testid="cadre-de-recadrage"
          className="absolute border-2 border-card"
          style={{ left: pourcent(cadre.x), top: pourcent(cadre.y), width: pourcent(cadre.largeur), height: pourcent(cadre.hauteur) }}
        />
        {COINS.map((coin) => {
          const p = positionDuCoin(cadre, coin);
          return (
            <button
              key={coin}
              type="button"
              aria-label={t(`coins.${coin}`)}
              onKeyDown={auClavier(coin)}
              onPointerDown={(e) => e.currentTarget.setPointerCapture?.(e.pointerId)}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) auPointeur(coin)(e);
              }}
              className="absolute inline-flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring active:cursor-grabbing"
              style={{ left: pourcent(p.x), top: pourcent(p.y) }}
            >
              <span aria-hidden="true" className="size-5 rounded-full border-2 border-card bg-primary shadow-sm" />
            </button>
          );
        })}
      </div>
      <div className={cn('flex items-center gap-3', onReprendre ? 'justify-between' : 'justify-center')}>
        <Button type="button" variant="outline" onClick={onTourner}>
          <RotateCw data-icon="inline-start" strokeWidth={1.75} aria-hidden="true" />
          {t('tourner')}
        </Button>
        {onReprendre ? (
          <button
            type="button"
            onClick={onReprendre}
            className="cursor-pointer rounded-md text-sm font-medium text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('reprendre')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
