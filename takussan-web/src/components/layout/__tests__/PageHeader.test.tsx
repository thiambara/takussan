import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PageHeader } from '../PageHeader';

describe('<PageHeader>', () => {
  it('renders the title as an h1 with font-display', () => {
    render(<PageHeader title="Tableau de bord" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Tableau de bord' });
    expect(h1.className).toContain('font-display');
    expect(h1.className).toContain('text-foreground');
  });

  it('renders the optional subtitle in muted foreground', () => {
    render(<PageHeader title="Biens" subtitle="Gérez votre portefeuille" />);
    const subtitle = screen.getByText('Gérez votre portefeuille');
    expect(subtitle.tagName).toBe('P');
    expect(subtitle.className).toContain('text-muted-foreground');
  });

  it('renders the eyebrow as an uppercase tracking label above the title', () => {
    render(<PageHeader title="Finances" eyebrow="agence" />);
    const eyebrow = screen.getByText('agence');
    expect(eyebrow.className).toContain('uppercase');
    expect(eyebrow.className).toContain('tracking-');
  });

  it('renders actions slot beside the title', () => {
    render(
      <PageHeader title="Biens" actions={<button type="button">Publier un bien</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Publier un bien' })).toBeInTheDocument();
  });

  it('omits the subtitle node entirely when not provided', () => {
    const { container } = render(<PageHeader title="Empty" />);
    expect(container.querySelectorAll('p').length).toBe(0);
  });
});
