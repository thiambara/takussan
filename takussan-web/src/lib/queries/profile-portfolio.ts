import { apiFetch } from '@/lib/api';
import type { PropertyListItem } from '@/types/property';
import { cheminApi, requete } from '@/lib/chemin-api';

export interface PortfolioPage {
  readonly data: PropertyListItem[];
  readonly meta: {
    readonly current_page: number;
    readonly last_page: number;
    readonly per_page: number;
    readonly total: number;
  };
}

export type PortfolioContract = 'rent' | 'sale';

/**
 * TCK-1730 (P168.02) — `contract` borne la page à un contrat (`filter[contract_type]`) : chaque
 * onglet du portefeuille se charge par l'API, au lieu de filtrer les biens déjà chargés.
 */
function requetePortefeuille(page: number, perPage: number, contract?: PortfolioContract) {
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (contract) qs.set('filter[contract_type]', contract);
  return requete(qs);
}

export function fetchAgentPortfolio(
  slug: string,
  page: number,
  perPage = 24,
  contract?: PortfolioContract,
): Promise<PortfolioPage> {
  return apiFetch<PortfolioPage>(
    cheminApi`/public/agents/${slug}/properties${requetePortefeuille(page, perPage, contract)}`,
  );
}

export function fetchAgencyPortfolio(
  slug: string,
  page: number,
  perPage = 24,
  contract?: PortfolioContract,
): Promise<PortfolioPage> {
  return apiFetch<PortfolioPage>(
    cheminApi`/public/agencies/${slug}/properties${requetePortefeuille(page, perPage, contract)}`,
  );
}
