export type Paginated<T> = {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
};

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  message: string;
  errors?: Record<string, string[]>;
};
