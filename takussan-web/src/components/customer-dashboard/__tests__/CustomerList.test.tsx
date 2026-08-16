import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { CustomerList } from '@/components/customer-dashboard/CustomerList';
import fr from '@/messages/fr.json';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';

function makePage(customer: CustomerListItem): PaginatedResponse<CustomerListItem> {
  return {
    data: [customer],
    meta: {
      total: 1,
      current_page: 1,
      last_page: 1,
      per_page: 20,
    },
    links: { first: null, last: null, prev: null, next: null },
  };
}

describe('CustomerList', () => {
  it('links existing customers to their CRM detail page', () => {
    render(
      <CustomerList
        page={makePage({
          id: 424,
          first_name: 'Awa',
          last_name: 'Ndiaye',
          email: 'awa@example.test',
          phone: '+221770000000',
          status: 'active',
          pipeline_stage: 'qualified',
          occupation: 'Architecte',
          created_at: '2026-05-06T10:00:00.000Z',
        })}
      />,
    );

    expect(screen.getByRole('link', { name: 'Awa Ndiaye' })).toHaveAttribute(
      'href',
      '/app/customers/424',
    );
  });

  it('rend l’état vide partagé, traduit, avec son CTA quand le CRM est vide', () => {
    // Dictionnaire réel plutôt que `useTranslations` mocké : un mock rendrait la clé et
    // laisserait passer un chemin `crm.list.*` inexistant.
    render(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="Africa/Dakar">
        <CustomerList
          page={{
            data: [],
            meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
            links: { first: null, last: null, prev: null, next: null },
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: fr.crm.list.empty_title }),
    ).toBeInTheDocument();
    expect(screen.getByText(fr.crm.list.empty_description)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.crm.list.empty_cta })).toHaveAttribute(
      'href',
      '/app/customers/new',
    );
  });
});
