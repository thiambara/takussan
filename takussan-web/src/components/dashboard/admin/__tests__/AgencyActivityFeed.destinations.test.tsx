import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { DashboardAgencySummary } from '@/lib/queries/dashboard-agency';
import { AgencyActivityFeed } from '../AgencyActivityFeed';

/**
 * TCK-375 — **chaque lien du flux d'activité mène à une page qui existe**, et l'équipe à l'écran
 * de l'administration de l'agence.
 *
 * TCK-375 avait mesuré que trois des quatre liens (`/app/bookings`, `/app/maintenance`,
 * `/app/customers`) n'avaient aucun équivalent dans l'ancienne console d'agence, et que seule
 * l'équipe y renvoyait. TCK-649 (ADR-0064) a fait de cette console une section de `/app` : `/app/agency/*`.
 * La question « reste-t-on dans la console ? » n'a donc plus d'objet — il n'y a plus qu'une
 * coque. Celle qui reste : le lien mène-t-il quelque part ?
 *
 * Le test la DÉRIVE du système de fichiers plutôt que d'une liste écrite à la main : un lien dont
 * la page disparaît, ou qu'on réécrit vers une page inexistante, le fait rougir en le nommant.
 * *Un invariant vérifié contre une liste écrite à la main n'est vrai que le jour où on l'écrit.*
 */

const RACINE_APP = join(process.cwd(), 'src', 'app', '(dashboard)', 'app');

/**
 * La page qui sert `segments` sous `dossier`, en traversant les groupes de routes (`(liste)`) :
 * ils structurent le système de fichiers sans apparaître dans l'URL.
 */
function pageExiste(dossier: string, segments: readonly string[]): boolean {
  if (segments.length === 0) {
    if (existsSync(join(dossier, 'page.tsx'))) return true;
  } else if (existsSync(join(dossier, segments[0]))) {
    if (pageExiste(join(dossier, segments[0]), segments.slice(1))) return true;
  }
  if (!existsSync(dossier)) return false;
  return readdirSync(dossier, { withFileTypes: true }).some(
    (entree) => entree.isDirectory() && /^\(.+\)$/.test(entree.name) && pageExiste(join(dossier, entree.name), segments),
  );
}

function summary(): DashboardAgencySummary {
  return {
    agency_id: 1,
    period: { start: '2026-05-01T00:00:00+00:00', end: '2026-05-31T23:59:59+00:00' },
    properties: { total: 10, published: 8, rented: 6, available: 2 },
    leases: { active: 6 },
    customers_count: 84,
    members_count: 5,
    bookings: { pending: 3 },
    maintenance: { open: 1 },
    finance: {
      revenue_month: 0,
      commission_month: 0,
      overdue_count: 0,
      overdue_amount: 0,
      unpaid_rate_percent: 0,
    },
    occupancy: { rate_percent: 60 },
  };
}

function liens(): string[] {
  const { container } = render(withIntl(<AgencyActivityFeed summary={summary()} />));
  return Array.from(container.querySelectorAll('a'))
    .map((a) => a.getAttribute('href'))
    .filter((h): h is string => Boolean(h));
}

describe('flux d’activité — destinations (TCK-375, TCK-649)', () => {
  it('chaque lien mène à une page de `/app` qui existe', () => {
    const hrefs = liens();
    expect(hrefs).toHaveLength(4);
    for (const href of hrefs) {
      expect(href.startsWith('/app/'), `${href} sort de /app`).toBe(true);
      const segments = href.slice('/app/'.length).split('?')[0].split('/');
      expect(pageExiste(RACINE_APP, segments), `${href} n'a pas de page.tsx`).toBe(true);
    }
  });

  it('l’équipe renvoie à l’administration de l’agence, `/app/agency/team`', () => {
    // Le préalable du test : si cette page disparaissait, l'assertion suivante ne mesurerait
    // plus rien.
    expect(pageExiste(RACINE_APP, ['agency', 'team'])).toBe(true);
    expect(liens()).toContain('/app/agency/team');
  });

  it('la résolution traverse les groupes de routes, et refuse une page qui n’existe pas', () => {
    // `/app/bookings` est servie par `bookings/(liste)/page.tsx` : sans la traversée, le premier
    // test rougirait sur un lien juste. Et une résolution qui accepterait tout ne prouverait rien.
    expect(pageExiste(RACINE_APP, ['bookings'])).toBe(true);
    expect(pageExiste(RACINE_APP, ['team'])).toBe(false);
  });
});
