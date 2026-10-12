import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';

import { DashboardShortcuts } from '../DashboardShortcuts';

const STANDARD: AccesAdmin = { chemins: ['/admin', '/admin/agency'], espaceIndividuel: false };
const SOLO: AccesAdmin = { chemins: ['/admin/agency', '/admin/finances'], espaceIndividuel: true };

function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

describe('<DashboardShortcuts>', () => {
  it('shows agent shortcuts and not owner-only ones for an agent', () => {
    const { container } = render(withIntl(<DashboardShortcuts roles={['agent']} />));
    const links = hrefs(container);

    expect(links).toContain('/app/customers');
    expect(links).toContain('/app/visits');
    expect(links).toContain('/app/messages');
    expect(links).not.toContain('/app/properties');
    expect(links).not.toContain('/app/payments');
  });

  it('shows tenant shortcuts including favorites and documents', () => {
    const { container } = render(withIntl(<DashboardShortcuts roles={['tenant']} />));
    const links = hrefs(container);

    expect(links).toContain('/app/leases');
    expect(links).toContain('/app/payments');
    expect(links).toContain('/app/documents');
    expect(links).toContain('/app/favorites');
  });

  it('combines roles and deduplicates shared destinations like /app/messages', () => {
    const { container } = render(withIntl(<DashboardShortcuts roles={['agent', 'owner']} />));
    const links = hrefs(container);

    // Both agent-specific and owner-specific shortcuts present.
    expect(links).toContain('/app/customers');
    expect(links).toContain('/app/properties');
    expect(links).toContain('/app/leases');

    // /app/messages is added once even though every role appends it.
    const messages = links.filter((href) => href === '/app/messages');
    expect(messages).toHaveLength(1);
  });

  it('renders the admin shortcuts only when an agency is attached', () => {
    const { container: withAgency } = render(
      withIntl(
        <AccesAdminProvider acces={STANDARD}>
          <DashboardShortcuts roles={['agency_admin']} agencyId={1} />
        </AccesAdminProvider>,
      ),
    );
    expect(hrefs(withAgency)).toContain('/admin');

    const { container: withoutAgency } = render(
      withIntl(
        <AccesAdminProvider acces={STANDARD}>
          <DashboardShortcuts roles={['agency_admin']} />
        </AccesAdminProvider>,
      ),
    );
    expect(hrefs(withoutAgency)).not.toContain('/admin');
  });

  it('TCK-633 — un solo : « Mon espace » vers sa première page, jamais /admin', () => {
    const { container } = render(
      withIntl(
        <AccesAdminProvider acces={SOLO}>
          <DashboardShortcuts roles={['agency_admin']} agencyId={1} />
        </AccesAdminProvider>,
      ),
    );
    expect(hrefs(container)).not.toContain('/admin');
    expect(screen.getByRole('link', { name: 'Mon espace' })).toHaveAttribute('href', '/admin/agency');
  });

  it("TCK-633 — aucune page d'admin accessible : aucun raccourci d'admin", () => {
    const { container } = render(
      withIntl(
        <AccesAdminProvider acces={{ chemins: [], espaceIndividuel: false }}>
          <DashboardShortcuts roles={['agency_admin']} agencyId={1} />
        </AccesAdminProvider>,
      ),
    );
    expect(hrefs(container).filter((h) => h.startsWith('/admin'))).toEqual([]);
  });

  it('renders the heading "Raccourcis" for screen readers', () => {
    render(withIntl(<DashboardShortcuts roles={['tenant']} />));
    expect(screen.getByRole('heading', { name: 'Raccourcis' })).toBeInTheDocument();
  });
});
