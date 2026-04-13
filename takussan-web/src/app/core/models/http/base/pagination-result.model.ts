export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  last_page: number;
  from: number;
  to: number;
}


