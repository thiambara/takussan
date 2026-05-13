'use client';

import * as React from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { FormError } from './FormError';

export type FormDatePickerProps<TFieldValues extends FieldValues> = {
  readonly name: FieldPath<TFieldValues>;
  readonly control: ControllerProps<TFieldValues>['control'];
  readonly label?: React.ReactNode;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly min?: string;
  readonly max?: string;
  readonly className?: string;
  readonly containerClassName?: string;
};

/**
 * `react-hook-form`-aware single-date picker. Wraps `DatePicker` and
 * exchanges values as ISO date strings (`YYYY-MM-DD`).
 */
export function FormDatePicker<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  placeholder,
  required,
  id,
  disabled,
  min,
  max,
  className,
  containerClassName,
}: FormDatePickerProps<TFieldValues>) {
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
                {required ? (
                  <span aria-hidden="true" className="ml-0.5 text-destructive">
                    *
                  </span>
                ) : null}
              </label>
            ) : null}
            <DatePicker
              id={inputId}
              value={field.value ?? ''}
              onValueChange={(value) => {
                field.onChange(value);
                field.onBlur();
              }}
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              min={min}
              max={max}
              aria-invalid={hasError || undefined}
              aria-describedby={hasError ? errorId : undefined}
              className={className}
            />
            <FormError id={errorId}>{fieldState.error?.message}</FormError>
          </div>
        );
      }}
    />
  );
}
