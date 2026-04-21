"use client"

import * as React from "react"
import { Field as FieldPrimitive } from "@base-ui/react/field"

import { cn } from "@/lib/utils"

/**
 * Label — form label built on @base-ui/react Field.Label.
 * When used inside a <Field.Root> it auto-associates with the control.
 * Can also be used standalone with htmlFor for arbitrary inputs.
 */
function Label({
  className,
  ...props
}: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60",
        className
      )}
      {...props}
    />
  )
}

export { Label }
