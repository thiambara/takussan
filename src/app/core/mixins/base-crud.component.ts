import {finalize} from "rxjs";
import {Component} from "@angular/core";
import {BaseModelInterface, ClassType, TableName} from "../models/http/base/base.model";
import {BaseHttpService} from "../services/http/base/base-http.service";
import {ConfirmationService, MessageService} from "primeng/api";
import {Table} from "primeng/table";

type OrderByType<T> =
  keyof T | string
  | { [key in keyof T | string]: 'asc' | 'desc' | 'ASC' | 'DESC' }
  | (keyof T | string | { [key in keyof T | string]: 'asc' | 'desc' | 'ASC' | 'DESC' })[];


export type CrudQueryParamsInterface<T extends BaseModelInterface> = {
  [key in TableName]?: {
    hidden?: (keyof T)[] | keyof T;
    with?: (keyof T)[] | keyof T;
    with_count?: (keyof T)[] | keyof T;
    appends?: (keyof T)[] | keyof T;
    [key: string]: any;
  };
} & {
  search_query?: string;
  page?: number;
  per_page?: number;
  limit?: number;
  columns?: (keyof T | string)[] | keyof T | string;
  order_by?: OrderByType<T>;
  filter_fields?: {
    [key in keyof T]?: string | number | boolean | null | (string | number | boolean | null)[]
  };
  filter_tags?: string[];
  [key: string]: any;
};

@Component({
  template: '',
  standalone: true
})
export class BaseCrudComponent<T extends BaseModelInterface> {
  public model!: ClassType<T>;
  public modelContextName: string = 'item';
  public items: T[] = [];
  public searchedItems: T[] = [];
  public currentItem?: T;
  public tableColumns: ({ field: keyof T | string, header: string })[] = [];
  public searchQuery: string = '';
  public page?: number;
  public perPage?: number;
  public totalCount?: number;
  public indexLoading: boolean = false;
  public getLoading: boolean = false;
  public createLoading: boolean = false;
  public updateLoading: boolean = false;
  public deleteLoading: boolean = false;
  public queryParams: CrudQueryParamsInterface<T> = {};
  public formDialogVisible: boolean = false;

  constructor(public apiService: BaseHttpService<T>, public messageService: MessageService, public confirmationService: ConfirmationService) {
  }

  public get loading(): boolean {
    return this.indexLoading || this.getLoading || this.createLoading || this.updateLoading || this.deleteLoading;
  }

  public get selectedItems(): T[] {
    return this.items.filter((item) => item.selected);
  }

  public handleErrors(error: any): void {
    console.log(error);
    this.messageService.add({severity: 'error', summary: 'Error', detail: 'An error has occurred', life: 3000});
  }

  public getIndexById(id: number): number {
    return this.items.findIndex((item: T) => item.id === id);
  }

  prepareColumns() {
    this.tableColumns = [];
  }

  openNew() {
    this.currentItem = new this.model();
    this.formDialogVisible = true;
  }

  editItem(item: T) {
    this.currentItem = {...item};
    this.formDialogVisible = true;
  }


  beforeSave(item: T): any {
    return item;
  }

  save(item: T) {
    this.currentItem = {...item};

    if (this.currentItem) {
      let data = this.beforeSave(item);
      this.currentItem.id ? this.update(this.currentItem.id, data) : this.create(data);
    }
  }

  confirmDeleteSelectedItems(event: Event, message?: string) {
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: message ?? `Are you sure that you want to delete the selected ${(this.modelContextName)}s?`,
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.deleteSelectedItems();
      }
    });
  }

  deleteSelectedItems() {
  }

  confirmDeleteItem(event: Event, item: T, message?: string) {
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: message ?? `Are you sure that you want to delete this ${(this.modelContextName)}?`,
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.deleteItem(item);
      }
    });
  }

  deleteItem(item: T) {
    this.currentItem = {...item};
    if (this.currentItem?.id) {
      this.delete(this.currentItem.id);
    }
  }


  onGlobalFilter(table: Table) {
    table.filterGlobal(this.searchQuery, 'contains');
  }

  selectionChange(selected: T[]) {
    this.items.forEach(item => item.selected = false);
    selected.forEach(item => item.selected = true);
  }


  /**
   * INDEX SECTION
   */

  public beforeIndex(params?: CrudQueryParamsInterface<T>): any {
    this.indexLoading = true;
    return params ?? this.queryParams;
  }

  public onIndexSuccess(response: any): void {
    if (this.queryParams.page || this.queryParams.per_page) {
      this.items = response.data;
      this.totalCount = response.total;
      this.page = response.current_page;
      this.perPage = response.per_page;
    } else {
      this.items = response;
    }
  }

  public onIndexError(error: any): void {
    this.handleErrors(error);
  }

  public afterIndexComplete(): void {
    this.indexLoading = false;
  }

  public index(params?: CrudQueryParamsInterface<T>): void {
    params = this.beforeIndex(params);
    this.apiService.index(params)
      .pipe(finalize(() => this.afterIndexComplete()))
      .subscribe({
        next: (response) => {
          this.onIndexSuccess(response);
        },
        error: (error) => {
          this.onIndexError(error);
        }
      });
  }

  /**
   * GET SECTION
   */

  public beforeGet(id: number, params: CrudQueryParamsInterface<T> = {}): any {
    this.getLoading = true;
    return params;
  }

  public onGetSuccess(response: any): void {
    this.currentItem = response.data;
  }

  public onGetError(error: any): void {
    this.handleErrors(error);
  }

  public afterGetComplete(): void {
    this.getLoading = false;
  }

  public get(id: number, params: CrudQueryParamsInterface<T> = {}): void {
    params = this.beforeGet(id, params);
    this.apiService.get(id, params)
      .pipe(finalize(() => this.afterGetComplete()))
      .subscribe({
        next: (response) => {
          this.onGetSuccess(response);
        },
        error: (error) => {
          this.onGetError(error);
        }
      });
  }

  /**
   * CREATE SECTION
   */

  public beforeCreate(data: T, params: CrudQueryParamsInterface<T> = {}): any {
    this.createLoading = true;
    return params;
  }

  public onCreateSuccess(response: any): void {
    this.formDialogVisible = false;
    this.items.unshift(response.data);
    this.messageService.add({
      severity: 'success',
      summary: 'Successful',
      detail: `${(this.modelContextName)} created`,
      life: 3000
    });
  }

  public onCreateError(error: any): void {
    this.handleErrors(error);
  }

  public afterCreateComplete(): void {
    this.createLoading = false;
  }

  public create(data: T, params: CrudQueryParamsInterface<T> = {}): void {
    params = this.beforeCreate(data, params);
    this.apiService.create(data, params)
      .pipe(finalize(() => this.afterCreateComplete()))
      .subscribe({
        next: (response) => {
          this.onCreateSuccess(response);
        },
        error: (error) => {
          this.onCreateError(error);
        }
      });
  }

  /**
   * UPDATE SECTION
   */

  public beforeUpdate(id: number, data: T, params: any = {}): any {
    this.updateLoading = true;
    return params;
  }

  public onUpdateSuccess(response: any): void {
    this.formDialogVisible = false;
    this.currentItem = {...response, selected: this.currentItem?.selected};
    const index = this.getIndexById(response.id);
    if (index !== -1) {
      this.items[index] = {...this.currentItem!};
    }
    this.messageService.add({
      severity: 'success',
      summary: 'Successful',
      detail: `${(this.modelContextName)} updated`,
      life: 3000
    });
  }

  public onUpdateError(error: any): void {
    this.handleErrors(error);
  }

  public afterUpdateComplete(): void {
    this.updateLoading = false;
  }

  public update(id: number, data: T, params: CrudQueryParamsInterface<T> = {}): void {
    params = this.beforeUpdate(id, data, params);
    this.apiService.update(id, data, params)
      .pipe(finalize(() => this.afterUpdateComplete()))
      .subscribe({
        next: (response) => {
          this.onUpdateSuccess(response);
        },
        error: (error) => {
          this.onUpdateError(error);
        }
      });
  }

  /**
   * DELETE SECTION
   */

  public beforeDelete(id: number, params: any = {}): any {
    this.deleteLoading = true;
    return params;
  }

  public onDeleteSuccess(response: any): void {
    this.items = this.items.filter((item: T) => item.id !== response.data.id);
    this.messageService.add({
      severity: 'success',
      summary: 'Successful',
      detail: `${(this.modelContextName)} deleted`,
      life: 3000
    });
  }

  public onDeleteError(error: any): void {
    this.handleErrors(error);
  }

  public afterDeleteComplete(): void {
    this.deleteLoading = false;
  }

  public delete(id: number, params: CrudQueryParamsInterface<T> = {}): void {
    params = this.beforeDelete(id, params);
    this.apiService.delete(id, params)
      .pipe(finalize(() => this.afterDeleteComplete()))
      .subscribe({
        next: (response: T) => {
          this.onDeleteSuccess(response);
        },
        error: (error) => {
          this.onDeleteError(error);
        }
      });
  }
}
