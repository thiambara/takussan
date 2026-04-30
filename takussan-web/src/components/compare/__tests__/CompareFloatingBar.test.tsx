import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { CompareFloatingBar } from '../CompareFloatingBar';
import { CompareProvider, useCompare } from '@/context/CompareContext';
import messages from '@/messages/fr.json';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    className,
    'aria-disabled': ariaDisabled,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    'aria-disabled'?: boolean;
  }) => (
    <a href={href} className={className} aria-disabled={ariaDisabled}>
      {children}
    </a>
  ),
}));

function Seed({ ids }: { ids: readonly number[] }) {
  const { replace } = useCompare();
  React.useEffect(() => {
    replace(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function wrap(ids: readonly number[]) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      <CompareProvider>
        <Seed ids={ids} />
        <CompareFloatingBar />
      </CompareProvider>
    </NextIntlClientProvider>
  );
}

describe('<CompareFloatingBar>', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is hidden when the selection is empty', () => {
    render(wrap([]));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('renders the count and CTA once ids are selected', async () => {
    render(wrap([1, 2]));
    // Wait for hydration + seed
    await screen.findByRole('complementary');
    expect(screen.getByText(/Comparer \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 4/)).toBeInTheDocument();
  });

  it('disables the CTA when only 1 id is selected', async () => {
    render(wrap([5]));
    const cta = (await screen.findByText(/Comparer \(1\)/)).closest('a');
    expect(cta).toHaveAttribute('aria-disabled', 'true');
  });

  it('links to /compare?ids=... when 2+ ids are selected', async () => {
    render(wrap([3, 4]));
    const link = (await screen.findByText(/Comparer \(2\)/)).closest('a');
    expect(link).toHaveAttribute('href', '/compare?ids=3,4');
  });

  it('removes a bien when clicking its avatar pill', async () => {
    const user = userEvent.setup();
    render(wrap([10, 20]));
    await screen.findByRole('complementary');

    const removeBtn = screen.getByRole('button', {
      name: /Retirer le bien #10/i,
    });
    await act(async () => {
      await user.click(removeBtn);
    });

    expect(screen.queryByText('#10')).not.toBeInTheDocument();
    expect(screen.getByText('#20')).toBeInTheDocument();
  });

  it('clears the whole comparator via the clear button', async () => {
    const user = userEvent.setup();
    render(wrap([1, 2, 3]));
    await screen.findByRole('complementary');

    const clearBtn = screen.getByRole('button', { name: /Vider le comparateur/i });
    await act(async () => {
      await user.click(clearBtn);
    });

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
