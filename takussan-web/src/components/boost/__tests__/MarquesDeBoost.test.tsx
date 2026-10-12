import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { withIntl } from '@/test/intl';
import { MarquesDeBoost } from '../MarquesDeBoost';

describe('MarquesDeBoost (TCK-633 lot F)', () => {
  it('dit « En vedette » et le badge acheté', () => {
    render(withIntl(<MarquesDeBoost featured badge="price_drop" />));

    expect(screen.getByText('En vedette')).toBeInTheDocument();
    expect(screen.getByText('Baisse de prix')).toBeInTheDocument();
  });

  it('ne rend rien sans marque, et ignore un badge inconnu', () => {
    const { container } = render(withIntl(<MarquesDeBoost featured={false} badge="autre" />));

    expect(container).toBeEmptyDOMElement();
  });
});
