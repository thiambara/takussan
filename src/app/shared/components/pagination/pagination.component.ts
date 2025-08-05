import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white px-4 py-3 border-t border-gray-200 sm:px-6" *ngIf="totalItems > 0">
      <div class="flex items-center justify-between">
        <!-- Mobile pagination -->
        <div class="flex-1 flex justify-between sm:hidden">
          <button 
            (click)="onPreviousPage()" 
            [disabled]="currentPage === 1"
            class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
            Previous
          </button>
          <button 
            (click)="onNextPage()" 
            [disabled]="currentPage === totalPages"
            class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
            Next
          </button>
        </div>
        
        <!-- Desktop pagination -->
        <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div class="flex items-center gap-2">
            <p class="text-sm text-gray-700">
              Showing {{ startIndex }} to {{ endIndex }} of {{ totalItems }} entries
            </p>
            <select 
              [value]="itemsPerPage" 
              (change)="onItemsPerPageChange($event)" 
              class="ml-2 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option *ngFor="let option of itemsPerPageOptions" [value]="option">{{ option }}</option>
            </select>
          </div>
          
          <div>
            <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
              <!-- Previous button -->
              <button 
                (click)="onPreviousPage()" 
                [disabled]="currentPage === 1"
                class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                <i class="pi pi-chevron-left"></i>
              </button>
              
              <!-- Page numbers -->
              <button 
                *ngFor="let page of visiblePages" 
                (click)="onPageChange(page)"
                [class]="getPageButtonClasses(page)">
                {{ page }}
              </button>
              
              <!-- Next button -->
              <button 
                (click)="onNextPage()" 
                [disabled]="currentPage === totalPages"
                class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                <i class="pi pi-chevron-right"></i>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PaginationComponent {
  @Input() currentPage: number = 1;
  @Input() totalItems: number = 0;
  @Input() itemsPerPage: number = 10;
  @Input() itemsPerPageOptions: number[] = [5, 10, 20, 50];
  @Input() maxVisiblePages: number = 5;

  @Output() pageChange = new EventEmitter<number>();
  @Output() itemsPerPageChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  get startIndex(): number {
    return (this.currentPage - 1) * this.itemsPerPage + 1;
  }

  get endIndex(): number {
    const end = this.currentPage * this.itemsPerPage;
    return Math.min(end, this.totalItems);
  }

  get visiblePages(): number[] {
    const pages: number[] = [];
    const halfVisible = Math.floor(this.maxVisiblePages / 2);

    let startPage = Math.max(1, this.currentPage - halfVisible);
    let endPage = Math.min(this.totalPages, startPage + this.maxVisiblePages - 1);

    // Adjust start page if we're near the end
    if (endPage - startPage < this.maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - this.maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  getPageButtonClasses(page: number): string {
    const baseClasses = 'relative inline-flex items-center px-4 py-2 border text-sm font-medium';
    
    if (page === this.currentPage) {
      return `${baseClasses} border-blue-500 bg-blue-50 text-blue-600`;
    }
    
    return `${baseClasses} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;
  }

  onPreviousPage(): void {
    if (this.currentPage > 1) {
      this.pageChange.emit(this.currentPage - 1);
    }
  }

  onNextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.pageChange.emit(this.currentPage + 1);
    }
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.pageChange.emit(page);
    }
  }

  onItemsPerPageChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newItemsPerPage = parseInt(target.value, 10);
    this.itemsPerPageChange.emit(newItemsPerPage);
  }
}
