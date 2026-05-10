import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { BrandingBanner } from '../BrandingBanner';

const messages = {
  agency: {
    branding: {
      banner: {
        title: 'Personnalisez votre agence',
        description: 'Ajoutez votre logo et vos couleurs pour une identité forte.',
        cta: 'Configurer',
      },
    },
  },
};

function renderBanner(href?: string) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <BrandingBanner href={href} />
    </NextIntlClientProvider>,
  );
}

describe('<BrandingBanner>', () => {
  it('renders the title, description and CTA', () => {
    renderBanner();
    expect(screen.getByText('Personnalisez votre agence')).toBeInTheDocument();
    expect(
      screen.getByText('Ajoutez votre logo et vos couleurs pour une identité forte.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /configurer/i })).toHaveAttribute(
      'href',
      '/admin/agency',
    );
  });

  it('honours a custom href', () => {
    renderBanner('/admin/agency?focus=logo');
    expect(screen.getByRole('link', { name: /configurer/i })).toHaveAttribute(
      'href',
      '/admin/agency?focus=logo',
    );
  });
});
