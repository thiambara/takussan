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

function kindClasses(kind: string | undefined) {
  switch (kind) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100"
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
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
