"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"

import { useTranslations } from "next-intl"

import { X } from "@/components/icons"
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

function ToastProvider(props: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function useToast() {
  return ToastPrimitive.useToastManager<ToastData>()
}

/**
 * Le ton du toast, sur les jetons du design system (TCK-384).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ POURQUOI LES VARIANTES `dark:` ONT DISPARU, ET POURQUOI CE N'EST PAS UNE PERTE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les tons `success` et `warning` portaient SIX classes chacun : un triplet clair sur l'échelle
 * Tailwind, plus un triplet `dark:` sur la même échelle en échelon inverse. C'est la forme qu'on
 * écrit quand aucun jeton ne bascule tout seul — et `error`, dix lignes plus bas, montrait déjà
 * la forme qui n'en a pas besoin.
 *
 * `--success` et `--warning` sont redéfinis dans `.dark` de `globals.css` (TCK-358 pour l'ocre,
 * TCK-381 pour le vert), donc `bg-success/10 text-success` bascule SEUL. Les douze classes
 * deviennent six, et le thème sombre cesse d'être une seconde table à tenir alignée à la main.
 *
 * Contrastes mesurés (WCAG 2.1, 2026-08-27) — l'aplat est à canal alpha, il se mesure donc
 * aplati sur `--card`, la surface sur laquelle le toast se pose :
 *
 *                 avant (échelle Tailwind)          après (jetons)
 *   succès clair  émeraude 900 sur 50 ... 9,14:1    #3f6b45 sur success/10 ... 5,36:1
 *   succès sombre émeraude 100 sur 950/40 13,98:1   #8fbf87 sur success/10 ... 6,26:1
 *   avert. clair  ambre 900 sur 50 ...... 8,73:1    #8a5410 sur warning/10 ... 5,42:1
 *   avert. sombre ambre 100 sur 950/40 .. 14,13:1   #e0a458 sur warning/10 ... 6,07:1
 *
 * ⚠ **Les quatre chiffres BAISSENT, et c'est écrit ici plutôt que tu.** Une échelle Tailwind
 * pousse le fond à l'extrême de sa rampe (`-50`, `-950`) et l'encre à l'autre : elle achète du
 * contraste en sortant de la famille chromatique du produit. Les quatre valeurs d'arrivée restent
 * au-dessus des 4,5:1 d'AA pour du texte normal, ce qui est le seuil qui s'applique — et le
 * bénéfice est ailleurs : `#ecfdf5` ne se retournait PAS sous `.dark`, il fallait le doubler.
 *
 * ⚠ **Le ton `error` n'est pas touché, délibérément.** Il ne portait aucune palette brute, et
 * l'aligner sur `/10` par symétrie ferait passer `--destructive` de 4,36:1 à 4,01:1 — sous AA.
 * *Une régression mesurée n'est pas un prix acceptable pour de la symétrie.*
 */
function kindClasses(kind: string | undefined) {
  switch (kind) {
    case "success":
      return "border-success/30 bg-success/10 text-success"
    case "warning":
      return "border-warning/30 bg-warning/10 text-warning"
    case "error":
      return "border-destructive/30 bg-destructive/5 text-destructive dark:bg-destructive/10"
    default:
      return "border-border bg-popover text-popover-foreground"
  }
}

/**
 * Toaster — viewport + renderer. Render once inside ToastProvider.
 * All toasts raised via useToast() appear here.
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
          "fixed top-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none sm:top-6 sm:right-6",
          className
        )}
        {...props}
      >
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            toast={toast}
            className={cn(
              "relative flex w-full flex-col gap-1 rounded-xl border p-4 pr-10 shadow-md outline-none",
              "data-[starting-style]:translate-x-4 data-[starting-style]:opacity-0",
              "data-[ending-style]:translate-x-4 data-[ending-style]:opacity-0",
              "transition-[transform,opacity] duration-150",
              kindClasses(toast.type)
            )}
          >
            <ToastPrimitive.Title className="text-sm font-semibold leading-none" />
            <ToastPrimitive.Description className="text-sm opacity-90" />
            {toast.data?.action && (
              <div className="mt-2 text-sm font-medium">
                {toast.data.action}
              </div>
            )}
            <ToastPrimitive.Close
              aria-label={t("close")}
              className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-md opacity-60 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  )
}

export { ToastProvider, Toaster, useToast }
export type { ToastKind }
