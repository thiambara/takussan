import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// `withIntl` charge le VRAI `fr.json` : depuis TCK-292 ces composants passent par next-intl, et
// un rendu sans provider LÈVE. Les assertions françaises sont inchangées — c'est le point.
import { withIntl } from '@/test/intl';
import { PropertyReviewReplyForm } from '../PropertyReviewReplyForm';

type ReplySubmit = ComponentProps<typeof PropertyReviewReplyForm>['onSubmit'];

describe('<PropertyReviewReplyForm>', () => {
  let submit: ReturnType<typeof vi.fn<ReplySubmit>>;

  beforeEach(() => {
    submit = vi.fn<ReplySubmit>().mockResolvedValue(undefined);
  });

  it('disables the primary action while the reply is empty or blank', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReviewReplyForm reviewId={42} onSubmit={submit} />));

    // No initial content → button disabled.
    expect(
      screen.getByRole('button', { name: /publier la réponse/i }),
    ).toBeDisabled();

    // Blank content → still disabled.
    await user.type(screen.getByLabelText(/contenu de la réponse/i), '   ');
    expect(
      screen.getByRole('button', { name: /publier la réponse/i }),
    ).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('TCK-2089 — une réponse d’un caractère se publie : l’API n’exige qu’une réponse non vide', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReviewReplyForm reviewId={9} onSubmit={submit} />));

    await user.type(screen.getByLabelText(/contenu de la réponse/i), 'ok');
    await user.click(screen.getByRole('button', { name: /publier la réponse/i }));

    expect(submit).toHaveBeenCalledWith(9, 'ok');
  });

  it('TCK-2089 — une réponse de 1500 caractères écrite depuis « Mes avis » se complète ici (2000 au plus, comme l’API)', () => {
    render(withIntl(<PropertyReviewReplyForm reviewId={3} initialContent={'a'.repeat(1500)} onSubmit={submit} />));

    expect(screen.getByLabelText(/contenu de la réponse/i)).toHaveAttribute('maxLength', '2000');
    expect(screen.getByText('1500/2000')).toBeInTheDocument();
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
