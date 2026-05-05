"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Label — native <label> with shared form-field styling.
 * Works standalone (with htmlFor) or inside a custom field wrapper.
 */
function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none text-foreground select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60",
        className
      )}
      {...props}
    />
  )
}

export { Label }
