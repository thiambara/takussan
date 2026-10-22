/**
 * TCK-1268 (P146.03) — les filtres de statut des biens proposent les onze cas de `PropertyStatus`.
 *
 * `propertyStatusValues` n'en avait que huit : ni `published`, ni `pending_review`, ni `rejected`,
 * que l'API écrit (`PropertyObserver`, `PropertyModerationService`). Un agent ne pouvait pas lister
 * ses biens en revue ou refusés. La même liste sert aux GESTES de changement de statut : elle reste
 * à huit, et le filtre lit une liste à lui.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import { withIntl } from '@/test/intl';
import { propertyStatusFilterValues, propertyStatusValues } from '@/lib/enums/property';
import { propertyStatusFilterOptions } from '@/components/property-form/options';
import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => nav.params,
}));

/** Les cas de l'enum de l'API, lus dans sa source. */
function casDeLApi(): string[] {
  const source = readFileSync(
    resolve(__dirname, '../../../../../takussan-api/app/Models/Enums/PropertyStatus.php'),
    'utf8',
  );
  return [...source.matchAll(/case\s+\w+\s*=\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('statuts de bien filtrables (TCK-1268, P146.03)', () => {
  it('le filtre propose exactement les cas que l’API sert', () => {
    const api = casDeLApi();
    expect(api).toHaveLength(11);
    const options = propertyStatusFilterOptions((cle: string) => cle).map((o) => o.value);
    expect([...options].sort()).toEqual([...api].sort());
    expect([...propertyStatusFilterValues].sort()).toEqual([...api].sort());
  });

  it('chaque statut filtrable a son libellé dans les trois langues', () => {
    for (const messages of [fr, en, wo]) {
      const libelles = messages.property.status as Record<string, string>;
      for (const statut of propertyStatusFilterValues) expect(libelles[statut], statut).toBeTruthy();
    }
  });

  it('les gestes de changement de statut n’offrent pas les états de modération', () => {
    for (const statut of ['published', 'pending_review', 'rejected']) {
      expect(propertyStatusValues as readonly string[]).not.toContain(statut);
    }
  });

  it('un `?status=pending_review` se lit traduit dans la puce, jamais brut', () => {
    nav.params = new URLSearchParams('status=pending_review');
    render(withIntl(<PropertyListFilters currentUserId={1} agentOptions={[]} />));

    expect(screen.getAllByText(fr.property.status.pending_review).length).toBeGreaterThan(0);
    expect(screen.queryByText('pending_review')).toBeNull();
  });
});
