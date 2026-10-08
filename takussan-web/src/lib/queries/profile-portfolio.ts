import { apiFetch } from '@/lib/api';
import type { PropertyListItem } from '@/types/property';
import { cheminApi } from '@/lib/chemin-api';

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
    cheminApi`/public/agents/${slug}/properties?page=${page}&per_page=${perPage}`,
  );
}

export function fetchAgencyPortfolio(slug: string, page: number, perPage = 24): Promise<PortfolioPage> {
  return apiFetch<PortfolioPage>(
    cheminApi`/public/agencies/${slug}/properties?page=${page}&per_page=${perPage}`,
  );
}
