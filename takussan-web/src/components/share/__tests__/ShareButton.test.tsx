import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButton } from '../ShareButton';

describe('<ShareButton>', () => {
  const originalShare = (navigator as unknown as { share?: unknown }).share;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: originalShare,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('renders a share trigger with the provided label', () => {
    render(
      <ShareButton url="https://takussan.sn/properties/foo" title="Villa Dakar" />,
    );
    expect(
      screen.getByRole('button', { name: /partager/i }),
    ).toBeInTheDocument();
  });

  it('falls back to clipboard when Web Share API is unavailable', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(navigator.clipboard, 'writeText');

    render(
      <ShareButton url="https://takussan.sn/x" title="Villa" />,
    );
    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('https://takussan.sn/x');
    });
    expect(await screen.findByText(/lien copié/i)).toBeInTheDocument();
  });

  it('prefers navigator.share when available', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareSpy,
      configurable: true,
      writable: true,
    });

    const user = userEvent.setup();
    render(
      <ShareButton
        url="https://takussan.sn/y"
        title="Studio Plateau"
        text="Regarde ce bien"
      />,
    );
    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(shareSpy).toHaveBeenCalledWith({
        title: 'Studio Plateau',
        text: 'Regarde ce bien',
        url: 'https://takussan.sn/y',
      });
    });
  });
});
