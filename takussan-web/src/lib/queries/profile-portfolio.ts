import { apiFetch } from '@/lib/api';
import type { PropertyListItem } from '@/types/property';

export interface PortfolioPage {
  readonly data: PropertyListItem[];
  readonly meta: {
    readonly current_page: number;
    readonly last_page: number;
    readonly per_page: number;
    readonly total: number;
  };
}

export function fetchAgentPortfolio(slug: string, page: number, perPage = 24): Promise<PortfolioPage> {
  return apiFetch<PortfolioPage>(
    `/public/agents/${encodeURIComponent(slug)}/properties?page=${page}&per_page=${perPage}`,
  );
}

export function fetchAgencyPortfolio(slug: string, page: number, perPage = 24): Promise<PortfolioPage> {
  return apiFetch<PortfolioPage>(
    `/public/agencies/${encodeURIComponent(slug)}/properties?page=${page}&per_page=${perPage}`,
  );
}
