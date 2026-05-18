import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Pagination } from '../Pagination';

describe('<Pagination>', () => {
  it('renders nothing when there is a single page (or less)', () => {
    const onChange = vi.fn();
    const { container } = render(<Pagination page={1} lastPage={1} onChange={onChange} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders previous/next buttons and the live position when multiple pages exist', () => {
    render(<Pagination page={2} lastPage={5} onChange={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeEnabled();
    expect(screen.getByText('Page 2 sur 5')).toBeInTheDocument();
  });

  it('disables Précédent on the first page and Suivant on the last page', () => {
    const { rerender } = render(<Pagination page={1} lastPage={3} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /précédent/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeEnabled();

    rerender(<Pagination page={3} lastPage={3} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /précédent/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled();
  });

  it('emits the next page index when navigating forward and clamps backward at 1', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={2} lastPage={4} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(onChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole('button', { name: /précédent/i }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('clamps forward navigation at lastPage', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={4} lastPage={4} onChange={onChange} />);

    // The Suivant button is disabled on the last page so it cannot fire.
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
