import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DashboardShortcuts } from '../DashboardShortcuts';

function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

describe('<DashboardShortcuts>', () => {
  it('shows agent shortcuts and not owner-only ones for an agent', () => {
    const { container } = render(<DashboardShortcuts roles={['agent']} />);
    const links = hrefs(container);

    expect(links).toContain('/app/customers');
    expect(links).toContain('/app/visits');
    expect(links).toContain('/app/messages');
    expect(links).not.toContain('/app/properties');
    expect(links).not.toContain('/app/payments');
  });

  it('shows tenant shortcuts including favorites and documents', () => {
    const { container } = render(<DashboardShortcuts roles={['tenant']} />);
    const links = hrefs(container);

    expect(links).toContain('/app/leases');
    expect(links).toContain('/app/payments');
    expect(links).toContain('/app/documents');
    expect(links).toContain('/app/favorites');
  });

  it('combines roles and deduplicates shared destinations like /app/messages', () => {
    const { container } = render(<DashboardShortcuts roles={['agent', 'owner']} />);
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
      <DashboardShortcuts roles={['agency_admin']} agencyId={1} />,
    );
    expect(hrefs(withAgency)).toContain('/admin');

    const { container: withoutAgency } = render(<DashboardShortcuts roles={['agency_admin']} />);
    expect(hrefs(withoutAgency)).not.toContain('/admin');
  });

  it('renders the heading "Raccourcis" for screen readers', () => {
    render(<DashboardShortcuts roles={['tenant']} />);
    expect(screen.getByRole('heading', { name: 'Raccourcis' })).toBeInTheDocument();
  });
});
