import {Component, EventEmitter, forwardRef, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR} from '@angular/forms';
import {debounceTime, distinctUntilChanged, Subject, takeUntil} from 'rxjs';

export interface AutocompleteOption {
  [key: string]: any;
}

@Component({
  selector: 'app-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AutocompleteComponent),
      multi: true
    }
  ],
  template: `
      <div class="relative w-full">
          <!-- Input Field -->
          <div class="relative">
              <input
                      #inputRef
                      type="text"
                      [(ngModel)]="inputValue"
                      (input)="onInput($event)"
                      (focus)="onFocus()"
                      (blur)="onBlur()"
                      (keydown)="onKeyDown($event)"
                      [placeholder]="placeholder"
                      [disabled]="disabled"
                      [readonly]="readonly"
                      class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      [class.border-red-500]="hasError"
                      [class.focus:ring-red-500]="hasError"
                      [class.focus:border-red-500]="hasError"
              />

              <!-- Dropdown Toggle Button -->
              <button
                      type="button"
                      (click)="toggleDropdown()"
                      [disabled]="disabled"
                      class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
              >
                  <svg class="w-4 h-4 transition-transform duration-200" [class.rotate-180]="isOpen" fill="none"
                       stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
              </button>

              <!-- Clear Button -->
              <button
                      *ngIf="selectedOption && !disabled && !readonly"
                      type="button"
                      (click)="clear()"
                      class="absolute inset-y-0 right-8 flex items-center px-1 text-gray-400 hover:text-red-500 transition-colors duration-200"
              >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
              </button>
          </div>

          <!-- Dropdown Panel -->
          <div
                  *ngIf="isOpen && (filteredOptions.length > 0 || loading || noResultsMessage)"
                  class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto animate-[fadeIn_0.2s_ease-in-out]"
          >
              <!-- Loading State -->
              <div *ngIf="loading" class="flex items-center justify-center py-4 text-gray-500">
                  <svg class="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  Loading...
              </div>

              <!-- No Results -->
              <div *ngIf="!loading && filteredOptions.length === 0 && noResultsMessage"
                   class="px-4 py-3 text-gray-500 text-sm">
                  {{ noResultsMessage }}
              </div>

              <!-- Options List -->
              <div *ngIf="!loading && filteredOptions.length > 0" class="py-1">
                  <button
                          *ngFor="let option of filteredOptions; let i = index"
                          type="button"
                          (click)="selectOption(option)"
                          [class.bg-blue-50]="i === highlightedIndex"
                          class="w-full px-4 py-2 text-left hover:bg-gray-50 focus:bg-blue-50 focus:outline-none transition-colors duration-150"
                  >
                      <ng-container *ngIf="optionTemplate; else defaultTemplate">
                          <ng-container
                                  *ngTemplateOutlet="optionTemplate; context: { $implicit: option }"></ng-container>
                      </ng-container>
                      <ng-template #defaultTemplate>
                          <div class="text-sm font-medium text-gray-900">
                              {{ getOptionLabel(option) }}
                          </div>
                      </ng-template>
                  </button>
              </div>
          </div>
      </div>

      <!-- Selected Option Display -->
      <div *ngIf="selectedOption && showSelectedOption" class="mt-2 p-3 bg-gray-50 rounded-lg border">
          <ng-container *ngIf="selectedTemplate; else defaultSelectedTemplate">
              <ng-container *ngTemplateOutlet="selectedTemplate; context: { $implicit: selectedOption }"></ng-container>
          </ng-container>
          <ng-template #defaultSelectedTemplate>
              <div class="text-sm font-medium text-gray-900">
                  {{ getOptionLabel(selectedOption) }}
              </div>
          </ng-template>
      </div>
  `
})
export class AutocompleteComponent implements ControlValueAccessor, OnInit, OnDestroy {
  @Input() options: AutocompleteOption[] = [];
  @Input() placeholder = 'Search...';
  @Input() displayField = 'label';
  @Input() valueField = 'value';
  @Input() disabled = false;
  @Input() readonly = false;
  @Input() loading = false;
  @Input() noResultsMessage = 'No results found';
  @Input() showSelectedOption = false;
  @Input() hasError = false;
  @Input() debounceTime = 300;
  @Input() optionTemplate: any;
  @Input() selectedTemplate: any;

  @Output() search = new EventEmitter<string>();
  @Output() optionSelected = new EventEmitter<AutocompleteOption>();
  @Output() cleared = new EventEmitter<void>();

  inputValue = '';
  selectedOption: AutocompleteOption | null = null;
  filteredOptions: AutocompleteOption[] = [];
  isOpen = false;
  highlightedIndex = -1;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  ngOnInit() {
    this.searchSubject
      .pipe(
        debounceTime(this.debounceTime),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(query => {
        this.search.emit(query);
        this.filterOptions(query);
      });

    this.filteredOptions = [...this.options];
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  writeValue(value: any): void {
    if (value) {
      this.selectedOption = value;
      this.inputValue = this.getOptionLabel(value);
    } else {
      this.selectedOption = null;
      this.inputValue = '';
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: any) {
    const value = event.target.value;
    this.inputValue = value;
    this.searchSubject.next(value);

    if (!value) {
      this.selectedOption = null;
      this.onChange(null);
    }

    this.isOpen = true;
    this.highlightedIndex = -1;
  }

  onFocus() {
    this.isOpen = true;
    this.onTouched();
  }

  onBlur() {
    // Delay closing to allow option selection
    setTimeout(() => {
      this.isOpen = false;
      this.highlightedIndex = -1;
    }, 200);
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredOptions.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex = Math.max(this.highlightedIndex - 1, -1);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.filteredOptions[this.highlightedIndex]) {
          this.selectOption(this.filteredOptions[this.highlightedIndex]);
        }
        break;
      case 'Escape':
        this.isOpen = false;
        this.highlightedIndex = -1;
        break;
    }
  }

  toggleDropdown() {
    if (this.disabled) return;

    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.searchSubject.next(this.inputValue);
    }
  }

  selectOption(option: AutocompleteOption) {
    this.selectedOption = option;
    this.inputValue = this.getOptionLabel(option);
    this.isOpen = false;
    this.highlightedIndex = -1;

    this.onChange(option);
    this.optionSelected.emit(option);
  }

  clear() {
    this.selectedOption = null;
    this.inputValue = '';
    this.isOpen = false;
    this.highlightedIndex = -1;

    this.onChange(null);
    this.cleared.emit();
  }

  getOptionLabel(option: AutocompleteOption): string {
    if (!option) return '';
    return option[this.displayField] || option.toString();
  }

  private onChange = (value: any) => {
  };

  private onTouched = () => {
  };

  private filterOptions(query: string) {
    if (!query) {
      this.filteredOptions = [...this.options];
      return;
    }

    const searchTerm = query.toLowerCase();
    this.filteredOptions = this.options.filter(option =>
      this.getOptionLabel(option).toLowerCase().includes(searchTerm)
    );
  }
}
