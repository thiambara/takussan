import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyReviewForm, REVIEW_CONTENT_MIN } from '../PropertyReviewForm';

describe('<PropertyReviewForm>', () => {
  let submit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    submit = vi.fn().mockResolvedValue(undefined);
  });

  it('blocks submit when no rating is selected', async () => {
    const user = userEvent.setup();
    render(<PropertyReviewForm onSubmit={submit} />);

    // Submit is disabled until a rating is picked.
    expect(screen.getByRole('button', { name: /publier/i })).toBeDisabled();

    // Filling the content without a rating keeps it disabled.
    await user.type(
      screen.getByPlaceholderText(new RegExp(`min\\. ${REVIEW_CONTENT_MIN}`, 'i')),
      'This is a long enough review.',
    );
    expect(screen.getByRole('button', { name: /publier/i })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('blocks submit when comment is shorter than the minimum', async () => {
    const user = userEvent.setup();
    render(<PropertyReviewForm onSubmit={submit} />);

    // Pick 5 stars.
    await user.click(screen.getByRole('radio', { name: /5 étoiles/i }));

    // Type fewer than REVIEW_CONTENT_MIN characters.
    await user.type(
      screen.getByPlaceholderText(new RegExp(`min\\. ${REVIEW_CONTENT_MIN}`, 'i')),
      'short',
    );

    // Button stays disabled as long as content is too short.
    expect(screen.getByRole('button', { name: /publier/i })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits payload when rating + long-enough comment are provided', async () => {
    const user = userEvent.setup();
    render(<PropertyReviewForm onSubmit={submit} />);

    await user.click(screen.getByRole('radio', { name: /4 étoiles/i }));
    await user.type(
      screen.getByPlaceholderText(new RegExp(`min\\. ${REVIEW_CONTENT_MIN}`, 'i')),
      'Un logement vraiment très agréable et calme.',
    );
    await user.click(screen.getByRole('button', { name: /publier/i }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 4,
        content: 'Un logement vraiment très agréable et calme.',
      }),
    );
  });

  it('surfaces the server error (e.g. 422 "déjà reviewed")', async () => {
    const user = userEvent.setup();
    const serverMessage = 'Vous avez déjà évalué ce bien.';
    submit = vi.fn().mockRejectedValue(new Error(serverMessage));
    render(<PropertyReviewForm onSubmit={submit} />);

    await user.click(screen.getByRole('radio', { name: /3 étoiles/i }));
    await user.type(
      screen.getByPlaceholderText(new RegExp(`min\\. ${REVIEW_CONTENT_MIN}`, 'i')),
      'Encore une tentative de publication.',
    );
    await user.click(screen.getByRole('button', { name: /publier/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(serverMessage);
  });
});
