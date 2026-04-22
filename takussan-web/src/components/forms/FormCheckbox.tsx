'use client';

import * as React from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { cn } from '@/lib/utils';
import { FormError } from './FormError';

export type FormCheckboxProps<TFieldValues extends FieldValues> = {
  readonly name: FieldPath<TFieldValues>;
  readonly control: ControllerProps<TFieldValues>['control'];
  readonly label: React.ReactNode;
  readonly required?: boolean;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly containerClassName?: string;
};

/**
 * Native `<input type="checkbox">` wired to react-hook-form.
 *
 * Uses a native input for reliable a11y semantics (screen readers,
 * form serialization, browser UI). Visual styling is Tailwind-based with
 * the `accent-primary` utility.
 */
export function FormCheckbox<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  required,
  id,
  disabled,
  containerClassName,
}: FormCheckboxProps<TFieldValues>) {
  const inputId = id ?? `field-${String(name)}`;
  const errorId = `${inputId}-error`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const hasError = Boolean(fieldState.error);
        const checked = Boolean(field.value);
        return (
          <div className={cn('w-full', containerClassName)}>
            <label
              htmlFor={inputId}
              className={cn(
                'flex cursor-pointer items-start gap-3 text-sm',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                id={inputId}
                type="checkbox"
                name={field.name}
                checked={checked}
                onChange={(e) => field.onChange(e.target.checked)}
                onBlur={field.onBlur}
                ref={field.ref}
                disabled={disabled}
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? errorId : undefined}
                aria-required={required || undefined}
                className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
              />
              <span className="text-muted-foreground">{label}</span>
            </label>
            <FormError id={errorId}>{fieldState.error?.message}</FormError>
          </div>
        );
      }}
    />
  );
}
