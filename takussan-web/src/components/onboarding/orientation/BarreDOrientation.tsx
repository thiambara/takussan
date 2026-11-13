'use client';

import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Logo } from '@/components/brand/Logo';
import { DeclarerEntree, type DeclarationDEntree } from '@/components/entree/CoqueDEntree';
import { BoutonFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';
import { cn } from '@/lib/utils';

/**
 * TCK-2608 — la barre de chaque écran de l'orientation, DÉCLARÉE à la coque d'entrée (maquette
 * `app-entree-orientation`, approche a) :
 *
 *  · téléphone (`enTete`, à la place de la barre de 56 px) : la marque ou « ← Retour » à gauche,
 *    l'action de l'écran à droite (« Plus tard », « Passer », ou rien) — ni intention ni avancement ;
 *  · bureau : la pastille « ← Retour » avant la marque (`retourBureau`), l'intention au centre (et
 *    l'avancement sur l'écran des portes), l'action à droite (`noteDeBarre`).
 *
 * La page monte la coque SANS sortie (`sortie` absente) : l'écran des portes n'a aucune saisie à
 * protéger, et sa seule issue est « Plus tard », qui s'enregistre (TCK-493).
 */
export interface BarreDOrientationProps {
  /** `common.appName`, le nom accessible de la marque (lu par le serveur : la coque n'a pas d'espace). */
  readonly marque: string;
  /** L'intention, au centre de la barre du bureau. */
  readonly titre: string;
  readonly pas?: number;
  readonly total?: number;
  /** « ← Retour » : l'écran précédent de l'orientation (un état, pas une adresse). */
  readonly retour?: { readonly libelle: string; readonly onClick: () => void };
  /** L'action de droite, ou rien. */
  readonly action?: { readonly libelle: string; readonly onClick: () => void; readonly desactivee?: boolean };
  readonly largeur?: DeclarationDEntree['largeur'];
  readonly objet?: ReactNode;
  readonly pied?: ReactNode;
}

const CLASSES_D_ACTION =
  'inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60';

export function DeclarerBarreDOrientation({ marque, titre, pas, total, retour, action, largeur, objet, pied }: BarreDOrientationProps) {
  const boutonDAction = (className: string) =>
    action ? (
      <button type="button" onClick={action.onClick} disabled={action.desactivee} className={cn(CLASSES_D_ACTION, className)}>
        {action.libelle}
      </button>
    ) : null;

  const enTete = (
    <header className="flex h-14 items-center gap-1 border-b border-border/70 bg-background px-1">
      {retour ? (
        <span className="flex items-center">
          <BoutonFlecheDeRetour libelle={retour.libelle} onClick={retour.onClick} />
          {/* Le libellé se voit (maquette) ; le nom accessible est celui de la flèche. */}
          <span aria-hidden="true" onClick={retour.onClick} className="-ml-1.5 cursor-pointer pr-2 text-corps font-medium">
            {retour.libelle}
          </span>
        </span>
      ) : (
        // La marque reste la sortie vers le site (TCK-493, « marque et sortie vers le site »).
        <NextLink href="/" className="ml-3 inline-flex rounded-md py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <Logo nom={marque} />
        </NextLink>
      )}
      <span className="flex-1" />
      {/* Maquette : le libellé seul, à 16 px du bord ; la cible garde ses 44 px de haut. */}
      <span className="pr-3">{boutonDAction('px-0 text-corps')}</span>
    </header>
  );

  return (
    <DeclarerEntree
      titre={titre}
      pas={pas}
      total={total}
      enTete={enTete}
      retourBureau={
        retour ? (
          <button
            type="button"
            onClick={retour.onClick}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {retour.libelle}
          </button>
        ) : undefined
      }
      noteDeBarre={/* Maquette : « Plus tard » (portes) à 12,6 px, « Passer » (écrans à retour) à 15 px. */ boutonDAction(cn('px-0', retour ? 'text-corps' : 'text-sm'))}
      largeur={largeur}
      objet={objet}
      pied={pied}
    />
  );
}
