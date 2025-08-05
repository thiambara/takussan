import {
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  TemplateRef,
  ViewChild
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';

export interface TableColumn {
  field: string;  // Changed from 'key' to 'field' to match usage
  header: string; // Changed from 'label' to 'header' to match usage
  sortable?: boolean;
  width?: string;
  type?: 'text' | 'date' | 'number' | 'custom';
}

export interface SortEvent {
  field: string;
  order: 1 | -1;
}

export interface SelectionEvent {
  selected: any[];
  item?: any;
  checked?: boolean;
}

export interface PageEvent {
  first: number;
  rows: number;
  page: number;
  pageCount: number;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
      <div class="bg-white rounded-lg shadow-sm border overflow-hidden" [class.opacity-50]="loading">
          <!-- Loading Overlay -->
          <div *ngIf="loading" class="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>

          <!-- Table Caption/Header -->
          <ng-content select="[slot=caption]"></ng-content>

          <!-- Table -->
          <div class="overflow-x-auto">
              <table #dataTable class="min-w-full divide-y divide-gray-200">
                  <!-- Table Header -->
                  <thead class="bg-gray-50">
                  <tr>
                      <th class="w-12 px-4 py-3 text-left" *ngIf="selectable">
                          <input
                                  type="checkbox"
                                  [checked]="isAllSelected"
                                  [indeterminate]="isSomeSelected"
                                  (change)="onSelectAll($event)"
                                  class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2">
                      </th>
                      <th
                              *ngFor="let column of columns"
                              class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              [class.cursor-pointer]="column.sortable"
                              [class.hover:bg-gray-100]="column.sortable"
                              [style.width]="column.width"
                              (click)="onSort(column)">
                          <div class="flex items-center gap-1">
                              {{ column.header }}
                              <!-- Sort Icons using SVG instead of PrimeNG -->
                              <svg *ngIf="column.sortable && sortField !== column.field" class="w-3 h-3 text-gray-400"
                                   fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
                              </svg>
                              <svg *ngIf="column.sortable && sortField === column.field && sortOrder === 1"
                                   class="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M5 15l7-7 7 7"></path>
                              </svg>
                              <svg *ngIf="column.sortable && sortField === column.field && sortOrder === -1"
                                   class="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M19 9l-7 7-7-7"></path>
                              </svg>
                          </div>
                      </th>
                  </tr>
                  </thead>

                  <!-- Table Body -->
                  <tbody class="bg-white divide-y divide-gray-200">
                  <!-- Custom Row Template -->
                  <ng-container *ngIf="rowTemplate">
                      <ng-container *ngFor="let item of paginatedData; trackBy: trackByFn; let i = index">
                          <ng-container
                                  *ngTemplateOutlet="rowTemplate; context: { 
                    $implicit: item, 
                    item: item, 
                    index: i, 
                    selected: isItemSelected(item) 
                  }">
                          </ng-container>
                      </ng-container>
                  </ng-container>

                  <!-- Default Row Template -->
                  <ng-container *ngIf="!rowTemplate">
                      <tr *ngFor="let item of paginatedData; trackBy: trackByFn"
                          class="hover:bg-gray-50 transition-colors duration-150">

                          <!-- Selection checkbox -->
                          <td class="px-4 py-3" *ngIf="selectable">
                              <input
                                      type="checkbox"
                                      [checked]="isItemSelected(item)"
                                      (change)="onSelectItem(item, $event)"
                                      class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2">
                          </td>

                          <!-- Data columns -->
                          <td
                                  *ngFor="let column of columns"
                                  class="px-4 py-3 whitespace-nowrap"
                                  [ngClass]="{
                  'text-sm text-gray-900': column.type !== 'number',
                  'text-sm font-medium text-gray-900': column.type === 'text',
                  'text-sm text-gray-900 text-right': column.type === 'number'
                }">

                              <!-- Custom template -->
                              <ng-container *ngIf="cellTemplate && column.type === 'custom'">
                                  <ng-container
                                          *ngTemplateOutlet="cellTemplate; context: { $implicit: item, column: column, value: getColumnValue(item, column.field) }">
                                  </ng-container>
                              </ng-container>

                              <!-- Default rendering -->
                              <ng-container *ngIf="!cellTemplate || column.type !== 'custom'">
                  <span *ngIf="column.type === 'date'">
                    {{ getColumnValue(item, column.field) | date: 'dd/MM/yyyy HH:mm:ss' }}
                  </span>
                                  <span *ngIf="column.type !== 'date'">
                    {{ getColumnValue(item, column.field) }}
                  </span>
                              </ng-container>
                          </td>
                      </tr>
                  </ng-container>

                  <!-- Empty state -->
                  <tr *ngIf="data.length === 0 && !loading">
                      <td [attr.colspan]="totalColumns" class="text-center">
                          <ng-content select="[slot=empty]"></ng-content>
                          <div *ngIf="!hasEmptySlot"
                               class="flex flex-col items-center justify-center py-12 text-gray-500">
                              <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor"
                                   viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                              </svg>
                              <span class="text-lg font-medium">{{ emptyMessage }}</span>
                          </div>
                      </td>
                  </tr>
                  </tbody>
              </table>
          </div>

          <!-- Pagination -->
          <div *ngIf="paginated && data.length > 0"
               class="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-700">Show</span>
                  <select
                          [(ngModel)]="currentRowsPerPage"
                          (ngModelChange)="onRowsPerPageChange($event)"
                          class="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500">
                      <option *ngFor="let option of rowsPerPageOptions" [value]="option">{{ option }}</option>
                  </select>
                  <span class="text-sm text-gray-700">entries</span>
              </div>

              <div *ngIf="showCurrentPageReport" class="text-sm text-gray-700">
                  {{ getCurrentPageReport() }}
              </div>

              <div class="flex items-center gap-1">
                  <button
                          (click)="previousPage()"
                          [disabled]="currentPage === 0"
                          class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
                      Previous
                  </button>

                  <button
                          *ngFor="let page of getVisiblePages()"
                          (click)="goToPage(page)"
                          [class.bg-blue-600]="page === currentPage"
                          [class.text-white]="page === currentPage"
                          [class.hover:bg-gray-100]="page !== currentPage"
                          class="px-3 py-1 text-sm border border-gray-300 rounded transition-colors">
                      {{ page + 1 }}
                  </button>

                  <button
                          (click)="nextPage()"
                          [disabled]="currentPage >= totalPages - 1"
                          class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
                      Next
                  </button>
              </div>
          </div>
      </div>
  `
})
export class DataTableComponent implements OnInit {
  @ViewChild('dataTable') dataTable!: ElementRef;

  @Input() data: any[] = [];
  @Input() columns: TableColumn[] = [];
  @Input() loading: boolean = false;
  @Input() selectable: boolean = false;
  @Input() selectedItems: any[] = [];
  @Input() sortField: string = '';
  @Input() sortOrder: 1 | -1 = 1;
  @Input() sortable: boolean = true;
  @Input() paginated: boolean = false;
  @Input() rowsPerPage: number = 10;
  @Input() rowsPerPageOptions: number[] = [5, 10, 20, 50];
  @Input() showCurrentPageReport: boolean = false;
  @Input() currentPageReportTemplate: string = 'Showing {first} to {last} of {totalRecords} entries';
  @Input() emptyMessage: string = 'No data available';
  @Output() sort = new EventEmitter<SortEvent>();
  @Output() selectionChange = new EventEmitter<SelectionEvent>();
  @Output() selectedItemsChange = new EventEmitter<any[]>();
  @Output() page = new EventEmitter<PageEvent>();
  @ContentChild('rowTemplate') rowTemplate?: TemplateRef<any>;
  @ContentChild('cellTemplate') cellTemplate?: TemplateRef<any>;
  currentPage: number = 0;
  currentRowsPerPage: number = 10;

  get totalColumns(): number {
    let count = this.columns.length;
    if (this.selectable) count++;
    return count;
  }

  get totalPages(): number {
    return Math.ceil(this.data.length / this.currentRowsPerPage);
  }

  get paginatedData(): any[] {
    if (!this.paginated) return this.data;

    const start = this.currentPage * this.currentRowsPerPage;
    const end = start + this.currentRowsPerPage;
    return this.data.slice(start, end);
  }

  get isAllSelected(): boolean {
    return this.data.length > 0 && this.selectedItems.length === this.data.length;
  }

  get isSomeSelected(): boolean {
    return this.selectedItems.length > 0 && this.selectedItems.length < this.data.length;
  }

  get hasEmptySlot(): boolean {
    // This would need proper content projection detection
    return false;
  }

  @Input() trackByFn: (index: number, item: any) => any = (index, item) => item.id || index;

  ngOnInit() {
    this.currentRowsPerPage = this.rowsPerPage;
  }

  onSort(column: TableColumn): void {
    if (!column.sortable || !this.sortable) return;

    let newOrder: 1 | -1 = 1;
    if (this.sortField === column.field) {
      newOrder = this.sortOrder === 1 ? -1 : 1;
    }

    this.sort.emit({
      field: column.field,
      order: newOrder
    });
  }

  onSelectAll(event: Event): void {
    const target = event.target as HTMLInputElement;
    const selected = target.checked ? [...this.data] : [];

    this.selectionChange.emit({
      selected,
      checked: target.checked
    });

    this.selectedItemsChange.emit(selected);
  }

  onSelectItem(item: any, event: Event): void {
    const target = event.target as HTMLInputElement;
    let selected = [...this.selectedItems];

    if (target.checked) {
      if (!this.isItemSelected(item)) {
        selected.push(item);
      }
    } else {
      selected = selected.filter(selectedItem =>
        this.getItemId(selectedItem) !== this.getItemId(item)
      );
    }

    this.selectionChange.emit({
      selected,
      item,
      checked: target.checked
    });

    this.selectedItemsChange.emit(selected);
  }

  isItemSelected(item: any): boolean {
    return this.selectedItems.some(selectedItem =>
      this.getItemId(selectedItem) === this.getItemId(item)
    );
  }

  getColumnValue(item: any, field: string): any {
    return field.split('.').reduce((obj, prop) => obj?.[prop], item);
  }

  // Pagination methods
  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.emitPageEvent();
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.emitPageEvent();
    }
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.emitPageEvent();
    }
  }

  onRowsPerPageChange(rows: number): void {
    this.currentRowsPerPage = rows;
    this.currentPage = 0; // Reset to first page
    this.emitPageEvent();
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const half = Math.floor(maxVisible / 2);

    let start = Math.max(0, this.currentPage - half);
    let end = Math.min(this.totalPages - 1, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(0, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  getCurrentPageReport(): string {
    const first = this.currentPage * this.currentRowsPerPage + 1;
    const last = Math.min((this.currentPage + 1) * this.currentRowsPerPage, this.data.length);
    const totalRecords = this.data.length;

    return this.currentPageReportTemplate
      .replace('{first}', first.toString())
      .replace('{last}', last.toString())
      .replace('{totalRecords}', totalRecords.toString());
  }

  // CSV Export functionality
  exportCSV(): void {
    if (this.data.length === 0) return;

    const csvContent = this.generateCSV();
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'data.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  private emitPageEvent(): void {
    this.page.emit({
      first: this.currentPage * this.currentRowsPerPage,
      rows: this.currentRowsPerPage,
      page: this.currentPage,
      pageCount: this.totalPages
    });
  }

  private getItemId(item: any): any {
    return item.id || item;
  }

  private generateCSV(): string {
    const headers = this.columns.map(col => col.header).join(',');
    const rows = this.data.map(item =>
      this.columns.map(col => {
        const value = this.getColumnValue(item, col.field);
        // Escape commas and quotes in CSV
        return typeof value === 'string' && (value.includes(',') || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"`
          : value;
      }).join(',')
    );

    return [headers, ...rows].join('\n');
  }
}
