'use client';

import * as React from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FormError } from './FormError';

type NativeInputProps = Omit<
  React.ComponentProps<'input'>,
  'name' | 'defaultValue' | 'value' | 'onChange' | 'onBlur' | 'ref'
>;

export type FormInputProps<TFieldValues extends FieldValues> = NativeInputProps & {
  readonly name: FieldPath<TFieldValues>;
  readonly control: ControllerProps<TFieldValues>['control'];
  readonly label?: React.ReactNode;
  /**
   * Optional trailing slot (icon, toggle button, etc.) rendered inside
   * the input wrapper on the right. Responsible for its own a11y.
   */
  readonly trailing?: React.ReactNode;
  /** Extra className applied to the outer wrapper. */
  readonly containerClassName?: string;
};

/**
 * `<input>` wired to react-hook-form via `Controller`. Shows the label,
 * field errors and optional trailing slot. The underlying element is the
 * shadcn `Input` (based on `@base-ui/react`), so visual parity with the
 * rest of the app is preserved.
 */
export function FormInput<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  id,
  trailing,
  className,
  containerClassName,
  required,
  ...inputProps
}: FormInputProps<TFieldValues>) {
  const inputId = id ?? `field-${String(name)}`;
  const errorId = `${inputId}-error`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const hasError = Boolean(fieldState.error);
        return (
          <div className={cn('w-full', containerClassName)}>
            {label ? (
              <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
                {label}
                {required ? <span aria-hidden="true" className="ml-0.5 text-destructive">*</span> : null}
              </label>
            ) : null}
            <div className={cn('relative', trailing ? 'flex items-stretch' : undefined)}>
              <Input
                id={inputId}
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? errorId : undefined}
                aria-required={required || undefined}
                className={cn(trailing && 'pr-10', className)}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
                {...inputProps}
              />
              {trailing ? (
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 text-muted-foreground">
                  {trailing}
                </div>
              ) : null}
            </div>
            <FormError id={errorId}>{fieldState.error?.message}</FormError>
          </div>
        );
      }}
    />
  );
}
