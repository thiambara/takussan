import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// `withIntl` charge le VRAI `fr.json` : depuis TCK-292 ces composants passent par next-intl, et
// un rendu sans provider LÈVE. Les assertions françaises sont inchangées — c'est le point.
import { withIntl } from '@/test/intl';
import { PropertyReviewReplyForm, REPLY_MIN } from '../PropertyReviewReplyForm';

type ReplySubmit = ComponentProps<typeof PropertyReviewReplyForm>['onSubmit'];

describe('<PropertyReviewReplyForm>', () => {
  let submit: ReturnType<typeof vi.fn<ReplySubmit>>;

  beforeEach(() => {
    submit = vi.fn<ReplySubmit>().mockResolvedValue(undefined);
  });

  it('disables the primary action when the content is too short', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReviewReplyForm reviewId={42} onSubmit={submit} />));

    // No initial content → button disabled.
    expect(
      screen.getByRole('button', { name: /publier la réponse/i }),
    ).toBeDisabled();

    // Type fewer than REPLY_MIN chars → still disabled.
    const tooShort = 'a'.repeat(REPLY_MIN - 1);
    await user.type(screen.getByLabelText(/contenu de la réponse/i), tooShort);
    expect(
      screen.getByRole('button', { name: /publier la réponse/i }),
    ).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits the reply with the reviewId when content is valid', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReviewReplyForm reviewId={77} onSubmit={submit} />));

    await user.type(
      screen.getByLabelText(/contenu de la réponse/i),
      'Merci pour votre avis, nous en prenons bonne note.',
    );
    await user.click(screen.getByRole('button', { name: /publier la réponse/i }));

    expect(submit).toHaveBeenCalledWith(
      77,
      'Merci pour votre avis, nous en prenons bonne note.',
    );
  });

  it('pre-fills the textarea when editing an existing reply', () => {
    render(withIntl(<PropertyReviewReplyForm
        reviewId={5}
        initialContent="Bonjour, merci pour votre retour."
        onSubmit={submit}
      />));

    const textarea = screen.getByLabelText(/contenu de la réponse/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Bonjour, merci pour votre retour.');
    expect(
      screen.getByRole('button', { name: /enregistrer/i }),
    ).toBeInTheDocument();
  });

  it('triggers onCancel when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    render(withIntl(<PropertyReviewReplyForm
        reviewId={1}
        initialContent="hello world"
        onSubmit={submit}
        onCancel={cancel}
      />));

    await user.click(screen.getByRole('button', { name: /annuler/i }));
    expect(cancel).toHaveBeenCalled();
  });
});
