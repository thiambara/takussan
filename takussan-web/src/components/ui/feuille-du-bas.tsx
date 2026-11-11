"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useMatchesMedia } from "@/hooks/useMatchesMedia"
import { useVerrouDeDefilement } from "@/hooks/useVerrouDeDefilement"
import { cn } from "@/lib/utils"

/**
 * TCK-2690 (ADR-0106) — LA FEUILLE DU BAS de la partie connectée : celle de la maquette retenue
 * (`chrome-app.tsx`, `FeuilleBas`, 31 occurrences), posée sur `Sheet`.
 *
 * Voile `foreground/35` ; panneau `rounded-t-2xl bg-card`, 90 % de la hauteur au plus, ombre
 * `shadow-feuille` (la valeur de `shadow-2xl`, que la charte refuse en classe) ; poignée 32 × 4 ;
 * en-tête `py-1 pl-4 pr-1`, titre de 17 px tronqué sur une ligne, fermer de 44 px (`size="icon"`
 * de la densité) ; corps `px-4 pb-4` qui défile ; pied facultatif `border-t px-4 py-3`. La zone sûre
 * du bas (`env(safe-area-inset-bottom)`, absente de la maquette) s'ajoute au pied s'il existe, au
 * corps sinon — jamais aux deux.
 *
 * **Dès `md`, ce n'est plus une feuille** : aucune maquette bureau n'en dessine. Le même contenu
 * s'ouvre en dialogue centré (`max-w-lg rounded-2xl`, sans poignée : 460,8 px et coins de 16,2 px au
 * bureau, sur l'échelle ×0,9), qui garde l'en-tête et le pied. Le panneau latéral de 480 px est une
 * autre primitive (TCK-2688).
 *
 * ⚠ **`SheetContent side="bottom"` n'est PAS touché** : les huit feuilles du bas existantes (sept
 * sur le site public) le complètent chacune à sa façon et gardent leur rendu. Cette primitive
 * monte son propre panneau dans le portail de `Sheet`.
 *
 * ⚠ **Hors du régime du bureau, le verrou de défilement est `useVerrouDeDefilement`, pas celui de
 * base-ui** (TCK-551) : sur un écran tactile, base-ui ne pose qu'un `overflow: hidden` que `scrollBy`
 * et iOS traversent — mesuré au téléphone ET sur une tablette de 1024 px à pointeur grossier (803 →
 * 1103). D'où `modal="trap-focus"` (piège du focus et `aria-hidden` du reste, SANS le verrou de la
 * primitive), pour ne pas empiler les deux verrous — cf. le docblock du crochet.
 * **Au régime du bureau** (`md` ET pointeur non grossier, celui de la densité dans `globals.css`),
 * c'est celui de base-ui (`modal`) : il compense une barre de défilement CLASSIQUE, que le crochet
 * ferait disparaître en sortant `body` du flux — saut DÉDUIT, non mesuré (le Chrome de mesure a des
 * barres superposées).
 */
interface FeuilleDuBasProps
  extends Omit<DialogPrimitive.Popup.Props, "children" | "className" | "title"> {
  /** Ouverture contrôlée. Sans elle, la feuille gère la sienne (`defaultOpen`, déclencheur). */
  readonly open?: boolean
  readonly defaultOpen?: boolean
  readonly onOpenChange?: DialogPrimitive.Root.Props["onOpenChange"]
  /** Le titre : 17 px, une ligne, tronqué. Il nomme le dialogue. */
  readonly titre: React.ReactNode
  /** L'élément qui ouvre la feuille (un `Button`) : rendu par `SheetTrigger`. */
  readonly declencheur?: React.ReactElement
  /** L'action collante du bas (bouton `xl` plein largeur, en général). */
  readonly pied?: React.ReactNode
  readonly className?: string
  readonly children: React.ReactNode
}

function FeuilleDuBas({
  open,
  defaultOpen = false,
  onOpenChange,
  titre,
  declencheur,
  pied,
  className,
  children,
  ...props
}: FeuilleDuBasProps) {
  const t = useTranslations("common.actions")
  const [ouverteSeule, setOuverteSeule] = React.useState(defaultOpen)
  const ouverte = open ?? ouverteSeule
  const bureau = useMatchesMedia("(width >= 48rem) and (not (pointer: coarse))")
  useVerrouDeDefilement(ouverte && !bureau)

  const changer: NonNullable<DialogPrimitive.Root.Props["onOpenChange"]> = (suivante, details) => {
    if (open === undefined) setOuverteSeule(suivante)
    onOpenChange?.(suivante, details)
  }

  return (
    <Sheet open={ouverte} onOpenChange={changer} modal={bureau ? true : "trap-focus"}>
      {declencheur ? <SheetTrigger render={declencheur} /> : null}
      <SheetPortal>
        <SheetOverlay className="bg-foreground/35" />
        <DialogPrimitive.Popup
          data-slot="feuille-du-bas"
          className={cn(
            "fixed z-50 flex flex-col bg-card text-card-foreground shadow-feuille outline-none duration-200",
            "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
            "max-md:data-open:slide-in-from-bottom max-md:data-closed:slide-out-to-bottom",
            "md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:max-h-[calc(100dvh-var(--spacing)*16)] md:rounded-2xl md:data-open:zoom-in-95 md:data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          <div
            data-slot="feuille-du-bas-poignee"
            aria-hidden="true"
            className="mx-auto mt-2 h-1 w-8 flex-none rounded-full bg-border md:hidden"
          />
          <div data-slot="feuille-du-bas-en-tete" className="flex flex-none items-center gap-2 py-1 pr-1 pl-4 md:pt-2">
            <SheetTitle className="min-w-0 flex-1 truncate text-titre-court font-semibold">{titre}</SheetTitle>
            <SheetClose
              data-slot="feuille-du-bas-fermer"
              render={<Button variant="ghost" size="icon" className="text-foreground" aria-label={t("close")} />}
            >
              <XIcon className="size-5" aria-hidden="true" />
            </SheetClose>
          </div>
          <div
            data-slot="feuille-du-bas-corps"
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4",
              pied ? "pb-4" : "pb-[calc(var(--spacing)*4+env(safe-area-inset-bottom))]"
            )}
          >
            {children}
          </div>
          {pied ? (
            <div
              data-slot="feuille-du-bas-pied"
              className="flex-none border-t border-border px-4 pt-3 pb-[calc(var(--spacing)*3+env(safe-area-inset-bottom))]"
            >
              {pied}
            </div>
          ) : null}
        </DialogPrimitive.Popup>
      </SheetPortal>
    </Sheet>
  )
}

export { FeuilleDuBas }
export type { FeuilleDuBasProps }
