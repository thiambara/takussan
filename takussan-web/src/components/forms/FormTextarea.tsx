'use client';

import * as React from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { FormError } from './FormError';

type NativeTextareaProps = Omit<
  React.ComponentProps<'textarea'>,
  'name' | 'defaultValue' | 'value' | 'onChange' | 'onBlur' | 'ref'
>;

export type FormTextareaProps<TFieldValues extends FieldValues> = NativeTextareaProps & {
  readonly name: FieldPath<TFieldValues>;
  readonly control: ControllerProps<TFieldValues>['control'];
  readonly label?: React.ReactNode;
  readonly containerClassName?: string;
};

export function FormTextarea<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  id,
  className,
  containerClassName,
  required,
  ...textareaProps
}: FormTextareaProps<TFieldValues>) {
  const textareaId = id ?? `field-${String(name)}`;
  const errorId = `${textareaId}-error`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const hasError = Boolean(fieldState.error);
        return (
          <div className={cn('w-full', containerClassName)}>
            {label ? (
              <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium">
                {label}
                {required ? <span aria-hidden="true" className="ml-0.5 text-destructive">*</span> : null}
              </label>
            ) : null}
            <Textarea
              id={textareaId}
              aria-invalid={hasError || undefined}
              aria-describedby={hasError ? errorId : undefined}
              aria-required={required || undefined}
              className={className}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              name={field.name}
              {...textareaProps}
            />
            <FormError id={errorId}>{fieldState.error?.message}</FormError>
          </div>
        );
      }}
    />
  );
}
