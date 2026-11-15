'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { cn } from '@/lib/utils';

export interface OngletDeFiche {
  readonly id: string;
  readonly libelle: string;
  /** Le compte affiché à côté du libellé (biens, agents, avis) ; absent : rien. */
  readonly compte?: number;
  readonly contenu: ReactNode;
}

export interface OngletsDeFicheProps {
  readonly onglets: readonly OngletDeFiche[];
  readonly libelle: string;
}

/**
 * TCK-2522 — les onglets collants d'une fiche d'agence : Biens · Équipe · Avis · Infos.
 *
 * Les quatre panneaux restent MONTÉS (`keepMounted`) : l'équipe, les avis et les infos sont dans
 * le HTML servi, lus par un moteur comme avant la vitrine, simplement masqués (`hidden`) tant que
 * leur onglet n'est pas choisi.
 *
 * La liste colle à `top-0` au téléphone (maquette FicheDBiens : ni barre du site, TCK-2568, ni rangée
 * « ← nom » au-dessus — décision de la session du 2026-11-09), la recherche du portefeuille sous
 * elle (49 px : `h-12` + la bordure) ; sous la barre du site dès `lg`, à la formule de
 * `NavbarSpacer` (`calc(1.5rem+53px)` : 77 px à 1024, 74,6 à 1440, où le `rem` du bureau rétrécit —
 * figée à 77, elle laissait à 1440 une bande de 2 px où passaient les cartes). Changer
 * d'onglet quand la liste est collée ramène le haut du panneau sous elle : sans quoi on arrivait au
 * milieu de l'équipe, à la hauteur où l'on avait quitté les biens.
 */
export function OngletsDeFiche({ onglets, libelle }: OngletsDeFicheProps) {
  const [actif, setActif] = useState(onglets[0]?.id ?? '');
  const ancre = useRef<HTMLDivElement>(null);

  return (
    <TabsPrimitive.Root
      value={actif}
      onValueChange={(valeur) => {
        setActif(String(valeur));
        const haut = ancre.current?.getBoundingClientRect().top;
        if (haut !== undefined && haut < 0) ancre.current?.scrollIntoView({ block: 'start' });
      }}
    >
      <div ref={ancre} className="scroll-mt-0 lg:scroll-mt-[calc(var(--spacing)*6+53px)]" aria-hidden />
      <TabsPrimitive.List
        aria-label={libelle}
        className="sticky top-0 z-20 -mx-4 flex border-b border-border bg-background px-4 sm:-mx-6 sm:px-6 lg:top-[calc(var(--spacing)*6+53px)] lg:mx-0 lg:gap-7 lg:px-0"
      >
        {onglets.map((onglet) => (
          <TabsPrimitive.Tab
            key={onglet.id}
            value={onglet.id}
            className={cn(
              'relative flex h-12 flex-1 items-center justify-center gap-1.5 text-[0.9375rem] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:flex-none',
              'data-active:text-foreground data-active:after:absolute data-active:after:inset-x-2 data-active:after:bottom-0 data-active:after:h-0.5 data-active:after:rounded-full data-active:after:bg-primary lg:data-active:after:inset-x-0',
            )}
          >
            {onglet.libelle}
            {onglet.compte !== undefined ? (
              <span className="text-[0.8125rem] font-normal tabular-nums text-muted-foreground">{onglet.compte}</span>
            ) : null}
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>
      {onglets.map((onglet) => (
        <TabsPrimitive.Panel key={onglet.id} value={onglet.id} keepMounted className="pt-6 outline-none">
          {onglet.contenu}
        </TabsPrimitive.Panel>
      ))}
    </TabsPrimitive.Root>
  );
}
