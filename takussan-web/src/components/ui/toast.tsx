"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"

import { useTranslations } from "next-intl"

import { Check, CircleAlert, Info, TriangleAlert, X } from "@/components/icons"
import { cn } from "@/lib/utils"

/**
 * Toast — feedback component built on @base-ui/react Toast primitives.
 *
 * Usage:
 * 1. Wrap the app (or a subtree) in <ToastProvider>.
 * 2. Render <Toaster /> once inside the provider, typically in the root layout.
 * 3. Call useToast().add({ title, description, type }) from anywhere beneath the provider.
 */

type ToastKind = "info" | "success" | "warning" | "error"

/**
 * Custom data accepted under `toast.add({ data: { action } })`.
 * `action` renders below the description — typically a link or button.
 * For sticky toasts, callers pass `timeout: 0` to `toast.add` directly
 * (Base UI handles dismissal via the toast object's own `timeout`).
 */
type ToastData = {
  action?: React.ReactNode
}

/**
 * TCK-2688 — L'ACTION TEXTE du toast sombre (« Annuler » de la maquette `app-demandes` a-3) : à
 * passer dans `data.action`. Graisse 500, encre principale à 80 % sur le fond sombre (ancêtre
 * `.dark` du toast : ≥ 11:1), une icône facultative de 16 px avant le libellé ; 44 px d'appui au
 * pouce par le pseudo-élément, sans grandir le toast.
 */
function ActionDuToast({ className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      data-slot="toast-action"
      className={cn(
        "relative inline-flex items-center gap-1 rounded-sm font-medium text-foreground/80 outline-none transition-colors after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:flex-none",
        className
      )}
      {...props}
    />
  )
}

function ToastProvider(props: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function useToast() {
  return ToastPrimitive.useToastManager<ToastData>()
}

/**
 * TCK-2688 — LE TOAST SOMBRE EN BAS, sur TOUT le produit (décision D8 du porteur, 2026-11-10,
 * ADR-0106 § 2 : un toast ne change pas de place selon la page). Maquette : `app-demandes` a-3,
 * `app-entree-connexion`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LA SURFACE : `.dark` POSÉ SUR LE TOAST, PAS UNE COULEUR INVERSÉE À LA MAIN
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * La maquette écrit `bg-foreground text-background` : l'encre du thème clair en fond. Les TONS,
 * eux, doivent alors prendre les valeurs du thème OPPOSÉ (un vert `--success` clair, #3f6b45, sur
 * #1f1812 tomberait à 2,9:1). Plutôt que de recopier ces valeurs dans des jetons « inverses », le
 * toast est une SURFACE sombre, comme la barre du super-admin : la classe `dark` sur sa racine fait
 * résoudre à `--background`, `--foreground` et aux quatre tons leur valeur sombre. `bg-background
 * text-foreground` y rend exactement `rgb(31, 24, 18)` / `rgb(252, 249, 243)` — la maquette.
 *
 * ⚠ En thème sombre, le toast RESTE sombre (D8 : « sombre en bas partout ») : son fond égale alors
 * celui de la page, d'où un anneau `border` (une ombre portée, sans effet sur la mise en page) sous
 * `.dark` d'un ANCÊTRE seulement (`[.dark_&]`), absent du thème clair, que la maquette dessine.
 *
 * Contrastes mesurés sur #1f1812 (WCAG 2.1, `toast-sombre-en-bas.tck-2688.test.tsx`) — une seule
 * surface dans les deux thèmes :
 *   texte `--foreground` #fcf9f3 ......... 16,6:1   description `--muted-foreground` ≥ 4,5:1
 *   icône succès à l'encre du toast #fcf9f3 (la coche de la maquette `app-demandes` a-3) ;
 *   attention #e0a458 · danger #ff7f7d · info #8fb2c8, que la maquette ne dessine pas : toutes ≥ 3:1 (1.4.11)
 *
 * ⚠ **Le fond reste OPAQUE (TCK-561)** : `bg-background` sans canal alpha, dans les deux thèmes
 * (`toast-fond-opaque.test.tsx`). Les aplats teintés d'avant (`color-mix` du ton dans `--card`)
 * sont retirés : le ton se dit par l'icône (coche à l'encre du toast, les autres en couleur) et le titre.
 */
const ICONE_DU_TON = {
  success: { Icone: Check, encre: "text-foreground" },
  warning: { Icone: TriangleAlert, encre: "text-warning" },
  error: { Icone: CircleAlert, encre: "text-destructive" },
  info: { Icone: Info, encre: "text-info" },
} as const satisfies Record<ToastKind, { Icone: React.ComponentType<{ className?: string }>; encre: string }>

function iconeDuTon(kind: string | undefined) {
  return kind && kind in ICONE_DU_TON ? ICONE_DU_TON[kind as ToastKind] : null
}

/**
 * Toaster — viewport + renderer. Render once inside ToastProvider.
 * All toasts raised via useToast() appear here.
 *
 * ⚠ **`z-[1200]` : le toast est la couche du DESSUS** (TCK-561, vérification adverse). Il valait
 * `z-[100]` sous des listes, menus et popovers à 1100 et des calques Leaflet à 1000 : un avis levé
 * menu ouvert passait dessous. `toast-au-premier-plan.test.tsx` compare l'index compilé au plus
 * grand écrit dans `src/` et dans `leaflet.css` — une couche neuve plus haute le fait rougir en
 * nommant son fichier.
 *
 * TCK-2688 — LA PLACE : en bas. Au téléphone, pleine largeur à 16 px des bords ; dès `sm`, 360 px
 * fixes (`w-toast`) en bas à droite (`right-6` : 24 px, 21,6 dès `lg` comme la maquette à 1440).
 * Le bas lit `--toast-bas` (`globals.css`) : 16 px au-dessus de la barre d'onglets de `/app` sous
 * `md` et de celle du site public sous `lg`.
 */
function Toaster({
  className,
  ...props
}: Omit<ToastPrimitive.Viewport.Props, "children">) {
  const t = useTranslations("ui.toast")
  const { toasts } = ToastPrimitive.useToastManager<ToastData>()
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toaster"
        className={cn(
          "fixed inset-x-4 bottom-(--toast-bas) z-[1200] flex flex-col gap-2 outline-none sm:left-auto sm:right-6 sm:w-toast",
          className
        )}
        {...props}
      >
        {toasts.map((toast) => {
          const ton = iconeDuTon(toast.type)
          return (
            <ToastPrimitive.Root
              key={toast.id}
              toast={toast}
              className={cn(
                "dark relative flex min-h-12 w-full items-center gap-3 rounded-xl bg-background px-4 py-3 text-sm text-foreground shadow-lg outline-none [.dark_&]:ring-1 [.dark_&]:ring-border",
                "data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
                "data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0",
                "transition-[transform,opacity] duration-150 motion-reduce:transition-none"
              )}
            >
              {ton ? <ton.Icone className={cn("size-5 flex-none", ton.encre)} aria-hidden="true" /> : null}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <ToastPrimitive.Title className="font-medium" />
                <ToastPrimitive.Description className="text-muted-foreground" />
              </div>
              {toast.data?.action ? (
                <div className="flex-none font-medium">{toast.data.action}</div>
              ) : null}
              {/* 24 px dessinés, 44 px d'appui : le pseudo-élément déborde de 10 px de chaque côté
                  (relevé au navigateur le 2026-09-24 : la croix mesurait 24 × 24, sous le plancher
                  tactile). La racine n'a pas d'`overflow-hidden`, qui rognerait la zone. */}
              <ToastPrimitive.Close
                aria-label={t("close")}
                className="relative -mr-1 inline-flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground outline-none transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  )
}

export { ActionDuToast, ToastProvider, Toaster, useToast }
export type { ToastKind }
