/**
 * TCK-743 (P33.02) — la garde du widget : le corps n'est chargé que pour un utilisateur connecté.
 *
 * Le module du corps est doublé, et son usine compte ses chargements : `next/dynamic` ne l'appelle
 * qu'au premier rendu du corps. Le visiteur anonyme ne doit jamais le déclencher.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const charge = vi.hoisted(() => vi.fn());
const useAuthMock = vi.fn<() => { user: { id: number } | null }>();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../CorpsDuWidget', () => {
  charge();
  return { CorpsDuWidget: () => <div data-testid="corps-du-widget" /> };
});

import { ChatWidget } from '../ChatWidget';

describe('<ChatWidget> garde', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it('ne rend rien et ne charge pas le corps pour un visiteur anonyme', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { container } = render(<ChatWidget />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
    expect(charge).not.toHaveBeenCalled();
  });

  it('charge et rend le corps pour un utilisateur connecté', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1 } });
    render(<ChatWidget />);
    expect(await screen.findByTestId('corps-du-widget')).toBeInTheDocument();
    expect(charge).toHaveBeenCalledTimes(1);
  });
});
