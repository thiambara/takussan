import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// `withIntl` charge le VRAI `fr.json` : depuis TCK-292 ces composants passent par next-intl, et
// un rendu sans provider LÈVE. Les assertions françaises sont inchangées — c'est le point.
import { withIntl } from '@/test/intl';
import { PropertyReviewForm } from '../PropertyReviewForm';

type ReviewSubmit = ComponentProps<typeof PropertyReviewForm>['onSubmit'];

describe('<PropertyReviewForm>', () => {
  let submit: ReturnType<typeof vi.fn<ReviewSubmit>>;

  beforeEach(() => {
    submit = vi.fn<ReviewSubmit>().mockResolvedValue(undefined);
  });

  it('blocks submit when no rating is selected', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReviewForm onSubmit={submit} />));

    // Submit is disabled until a rating is picked.
    expect(screen.getByRole('button', { name: /publier/i })).toBeDisabled();

    // Filling the content without a rating keeps it disabled.
    await user.type(
      screen.getByPlaceholderText(/votre commentaire/i),
      'This is a long enough review.',
    );
    expect(screen.getByRole('button', { name: /publier/i })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('TCK-2089 — un avis noté sans commentaire se publie, sans `content` : l’API ne l’exige pas', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReviewForm onSubmit={submit} />));

    await user.click(screen.getByRole('radio', { name: /5 étoiles/i }));
    await user.click(screen.getByRole('button', { name: /publier/i }));

    expect(submit).toHaveBeenCalledWith({ rating: 5, title: undefined, content: undefined });
  });

  it('TCK-2089 — un commentaire court est accepté, et le champ en permet 2000 comme l’API', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReviewForm onSubmit={submit} />));

    await user.click(screen.getByRole('radio', { name: /4 étoiles/i }));
    await user.type(screen.getByPlaceholderText(/votre commentaire/i), 'Calme.');
    expect(screen.getByPlaceholderText(/votre commentaire/i)).toHaveAttribute('maxLength', '2000');
    await user.click(screen.getByRole('button', { name: /publier/i }));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ rating: 4, content: 'Calme.' }));
  });

  it('submits payload when rating + long-enough comment are provided', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReviewForm onSubmit={submit} />));

    await user.click(screen.getByRole('radio', { name: /4 étoiles/i }));
    await user.type(
      screen.getByPlaceholderText(/votre commentaire/i),
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
    submit = vi.fn<ReviewSubmit>().mockRejectedValue(new Error(serverMessage));
    render(withIntl(<PropertyReviewForm onSubmit={submit} />));

    await user.click(screen.getByRole('radio', { name: /3 étoiles/i }));
    await user.type(
      screen.getByPlaceholderText(/votre commentaire/i),
      'Encore une tentative de publication.',
    );
    await user.click(screen.getByRole('button', { name: /publier/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(serverMessage);
  });

  it('TCK-869 — le titre et le commentaire sont nommés, pas seulement par leur placeholder', () => {
    render(withIntl(<PropertyReviewForm onSubmit={submit} />));

    for (const champ of screen.getAllByRole('textbox')) {
      expect(champ).toHaveAttribute('aria-label', champ.getAttribute('placeholder'));
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });
});
