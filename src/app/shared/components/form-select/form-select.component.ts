import {Component, EventEmitter, forwardRef, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlValueAccessor, NG_VALUE_ACCESSOR} from '@angular/forms';

export interface SelectOption {
  label: string;
  value: any;
  disabled?: boolean;
}

@Component({
  selector: 'app-form-select',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FormSelectComponent),
      multi: true
    }
  ],
  template: `
      <select
              [value]="value"
              [disabled]="disabled"
              [class]="selectClasses"
              (change)="onChange($event)"
              (blur)="onBlur()"
      >
          <option *ngIf="placeholder" value="" disabled>{{ placeholder }}</option>
          <option
                  *ngFor="let option of options"
                  [value]="option.value"
                  [disabled]="option.disabled">
              {{ option.label }}
          </option>
      </select>
  `
})
export class FormSelectComponent implements ControlValueAccessor {
  @Input() options: SelectOption[] = [];
  @Input() placeholder?: string;
  @Input() disabled: boolean = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() hasError: boolean = false;

  @Output() selectionChange = new EventEmitter<any>();

  value: any = '';

  get selectClasses(): string {
    const baseClasses = [
      'w-full',
      'border',
      'rounded-md',
      'focus:outline-none',
      'focus:ring-2',
      'focus:border-transparent',
      'disabled:bg-gray-50',
      'disabled:text-gray-500',
      'disabled:cursor-not-allowed',
      'appearance-none',
      'bg-white',
      'bg-no-repeat',
      'bg-right',
      'pr-8'
    ];

    // Size classes
    const sizeClasses = {
      sm: ['px-2', 'py-1', 'text-sm'],
      md: ['px-3', 'py-2', 'text-sm'],
      lg: ['px-4', 'py-3', 'text-base']
    };

    // State classes
    const stateClasses = this.hasError
      ? ['border-red-300', 'focus:ring-red-500', 'focus:border-red-500']
      : ['border-gray-300', 'focus:ring-blue-500', 'focus:border-blue-500'];

    // Add custom dropdown arrow
    const backgroundImage = `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`;

    return [
      ...baseClasses,
      ...sizeClasses[this.size],
      ...stateClasses
    ].join(' ');
  }

  onChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.value = target.value;
    this.onChangeCallback(this.value);
    this.selectionChange.emit(this.value);
  }

  onBlur(): void {
    this.onTouchedCallback();
  }

  // ControlValueAccessor implementation
  writeValue(value: any): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChangeCallback = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedCallback = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  private onChangeCallback = (_: any) => {
  };

  private onTouchedCallback = () => {
  };
}
