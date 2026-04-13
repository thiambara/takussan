import {BaseModelInterface, TableName} from "./base.model";

type OrderByType<T> =
  keyof T | string
  | { [key in keyof T | string]: 'asc' | 'desc' | 'ASC' | 'DESC' }
  | (keyof T | string | { [key in keyof T | string]: 'asc' | 'desc' | 'ASC' | 'DESC' })[];


export type BaseHttpIndexQueryParams<T extends BaseModelInterface> = {
  [key in TableName]?: {
    hidden?: (keyof T)[] | keyof T;
    with?: (keyof T | string)[] | keyof T | string;
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
    [key in keyof T | string]?: string | number | boolean | null | (string | number | boolean | null)[]
  };
  filter_tags?: string[];
  [key: string]: any;
};
