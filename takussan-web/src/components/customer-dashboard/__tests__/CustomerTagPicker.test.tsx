import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import {
  CustomerTagPicker,
  CustomerTagChips,
} from '../CustomerTagPicker';

const mockAttach = vi.fn();
const mockDetach = vi.fn();

vi.mock('@/app/actions/dashboard-customers', () => ({
  attachCustomerTagsAction: (...args: unknown[]) => mockAttach(...args),
  detachCustomerTagAction: (...args: unknown[]) => mockDetach(...args),
}));

function makeTag(id: number, name: string) {
  return { id, name, slug: name, color: null };
}

describe('CustomerTagChips', () => {
  it('renders nothing when tags is empty', () => {
    const { container } = render(<CustomerTagChips tags={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders tag chips', () => {
    render(<CustomerTagChips tags={[makeTag(1, 'vip'), makeTag(2, 'prospect')]} />);
    expect(screen.getByText('vip')).toBeTruthy();
    expect(screen.getByText('prospect')).toBeTruthy();
  });

  it('calls onTagClick when chip is clicked', () => {
    const handler = vi.fn();
    render(
      <CustomerTagChips tags={[makeTag(1, 'vip')]} onTagClick={handler} />,
    );
    fireEvent.click(screen.getByText('vip'));
    expect(handler).toHaveBeenCalledWith('vip');
  });
});

describe('CustomerTagPicker', () => {
  beforeEach(() => {
    mockAttach.mockReset();
    mockDetach.mockReset();
  });

  it('renders initial tags with remove buttons', () => {
    render(
      <CustomerTagPicker
        customerId={1}
        initialTags={[makeTag(1, 'vip'), makeTag(2, 'prospect')]}
      />,
    );
    expect(screen.getByText('vip')).toBeTruthy();
    expect(screen.getByText('prospect')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Retirer/ })).toHaveLength(2);
  });

  it('attaches a new tag on Enter', async () => {
    mockAttach.mockResolvedValue({ ok: true, data: [makeTag(1, 'vip'), makeTag(3, 'new')] });

    render(
      <CustomerTagPicker
        customerId={1}
        initialTags={[makeTag(1, 'vip')]}
      />,
    );

    const input = screen.getByPlaceholderText('Ajouter un tag…');
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mockAttach).toHaveBeenCalledWith(1, ['new']));
    await waitFor(() => expect(screen.getByText('new')).toBeTruthy());
  });

  it('attaches a new tag on comma key', async () => {
    mockAttach.mockResolvedValue({ ok: true, data: [makeTag(3, 'tagname')] });

    render(<CustomerTagPicker customerId={1} initialTags={[]} />);

    const input = screen.getByPlaceholderText('Ajouter un tag…');
    fireEvent.change(input, { target: { value: 'tagname' } });
    fireEvent.keyDown(input, { key: ',' });

    await waitFor(() => expect(mockAttach).toHaveBeenCalledWith(1, ['tagname']));
  });

  it('detaches a tag when X is clicked', async () => {
    mockDetach.mockResolvedValue({ ok: true });

    render(
      <CustomerTagPicker customerId={1} initialTags={[makeTag(42, 'vip')]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le tag vip' }));

    await waitFor(() => expect(mockDetach).toHaveBeenCalledWith(1, 42));
    await waitFor(() => expect(screen.queryByText('vip')).toBeNull());
  });

  it('shows error message on attach failure', async () => {
    mockAttach.mockResolvedValue({ ok: false, message: 'Max 10 tags atteint.' });

    render(<CustomerTagPicker customerId={1} initialTags={[]} />);

    const input = screen.getByPlaceholderText('Ajouter un tag…');
    fireEvent.change(input, { target: { value: 'overflowing' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByText('Max 10 tags atteint.')).toBeTruthy(),
    );
  });

  it('disables input when 10 tags are present', () => {
    const tenTags = Array.from({ length: 10 }, (_, i) => makeTag(i + 1, `tag${i + 1}`));
    render(<CustomerTagPicker customerId={1} initialTags={tenTags} />);
    const input = screen.getByPlaceholderText('Max 10 tags');
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it('shows autocomplete suggestions matching input', async () => {
    render(
      <CustomerTagPicker
        customerId={1}
        initialTags={[]}
        suggestions={[
          { id: 10, name: 'vip', color: null },
          { id: 11, name: 'prospect', color: null },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText('Ajouter un tag…');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'v' } });
    });

    expect(screen.queryByRole('list')).toBeTruthy();
    expect(screen.queryByText('vip')).toBeTruthy();
    expect(screen.queryByText('prospect')).toBeNull();
  });
});
