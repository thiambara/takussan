'use client';

import * as React from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FormError } from './FormError';

export interface FormSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type FormSelectProps<TFieldValues extends FieldValues> = {
  readonly name: FieldPath<TFieldValues>;
  readonly control: ControllerProps<TFieldValues>['control'];
  readonly options: readonly FormSelectOption[];
  readonly label?: React.ReactNode;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly triggerClassName?: string;
  readonly containerClassName?: string;
};

/**
 * `<select>` wired to react-hook-form using the shadcn (base-ui) Select
 * primitives. Accepts a flat list of options; consumers that need groups
 * can drop back to the primitives directly.
 */
export function FormSelect<TFieldValues extends FieldValues>({
  name,
  control,
  options,
  label,
  placeholder = '—',
  required,
  id,
  disabled,
  triggerClassName,
  containerClassName,
}: FormSelectProps<TFieldValues>) {
  const triggerId = id ?? `field-${String(name)}`;
  const errorId = `${triggerId}-error`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const hasError = Boolean(fieldState.error);
        return (
          <div className={cn('w-full', containerClassName)}>
            {label ? (
              <label htmlFor={triggerId} className="mb-1.5 block text-sm font-medium">
                {label}
                {required ? <span aria-hidden="true" className="ml-0.5 text-destructive">*</span> : null}
              </label>
            ) : null}
            <Select
              value={field.value ?? ''}
              onValueChange={(v) => field.onChange(v)}
              disabled={disabled}
              items={options}
            >
              <SelectTrigger
                id={triggerId}
                className={cn('w-full', triggerClassName)}
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? errorId : undefined}
                aria-required={required || undefined}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormError id={errorId}>{fieldState.error?.message}</FormError>
          </div>
        );
      }}
    />
  );
}
