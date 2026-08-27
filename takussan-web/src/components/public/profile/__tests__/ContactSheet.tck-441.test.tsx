import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { ContactSheet } from '../ContactSheet';

/**
 * `ToastProvider` est monté par `(public)/layout.tsx` en production — le dialogue partagé y lit
 * `useToast`. Le harnais le reproduit ; `vitest.setup.ts` ne monte aucun provider.
 */
function monte(ui: React.ReactElement) {
  return render(withIntl(<ToastProvider>{ui}</ToastProvider>));
}

const submitAgentContactLead = vi.fn(async () => ({ ok: true as const }));

vi.mock('@/app/actions/property', () => ({
  submitAgentContactLead: (...args: unknown[]) => submitAgentContactLead(...(args as [])),
}));

/**
 * TCK-441 — la fiche d'agent ne publie plus l'adresse de connexion, et le contact reste ANONYME.
 */
describe('ContactSheet — TCK-441', () => {
  beforeEach(() => submitAgentContactLead.mockClear());

  /**
   * AC4, premier sens : plus de `mailto:` portant l'adresse retirée.
   * L'assertion porte sur le DOM entier — un `mailto:` reparu dans la feuille mobile, ou dans un
   * bouton qu'on n'interroge pas nommément, doit faire rougir ce test.
   */
  it("ne rend aucun mailto quand la fiche est celle d'un agent", () => {
    const { container } = monte(
      <ContactSheet name="Awa Diop" agentSlug="awa-diop" phone="+221771234567" />,
    );

    expect(container.innerHTML).not.toContain('mailto:');
  });

  /** AC4, second sens : le téléphone RESTE joignable — c'est la décision du ticket. */
  it('rend toujours le lien tel: de l’agent', () => {
    const { container } = monte(
      <ContactSheet name="Awa Diop" agentSlug="awa-diop" phone="+221771234567" />,
    );

    expect(container.innerHTML).toContain('tel:+221771234567');
  });

  /**
   * AC3 côté écran : écrire à un agent n'exige aucun compte. Le test ne monte AUCUN
   * `AuthProvider` — un visiteur strictement anonyme — et le formulaire doit s'ouvrir quand même.
   */
  it("ouvre un formulaire anonyme, sans exiger de compte, et l'envoie", async () => {
    const user = userEvent.setup();
    monte(<ContactSheet name="Awa Diop" agentSlug="awa-diop" phone="+221771234567" />);

    await user.click(screen.getAllByRole('button')[0]!);

    await user.type(screen.getByLabelText(/nom/i), 'Moussa Fall');
    await user.type(screen.getByLabelText(/e-?mail/i), 'moussa@example.test');
    await user.type(screen.getByLabelText(/message/i), 'Bonjour, je cherche un F3.');
    await user.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(submitAgentContactLead).toHaveBeenCalledTimes(1);
    expect(submitAgentContactLead.mock.calls[0]![0]).toBe('awa-diop');
  });

  /**
   * L'adresse d'ENTREPRISE d'une agence reste un `mailto:` — elle est publiée délibérément, et
   * ce ticket ne la touche pas. Sans ce test, une correction trop large passerait inaperçue.
   */
  it("conserve le mailto d'une agence, qui publie une adresse d'entreprise", () => {
    const { container } = monte(
      <ContactSheet name="Baobab Immo" email="contact@baobab.test" phone="+221338000000" />,
    );

    expect(container.innerHTML).toContain('mailto:contact@baobab.test');
  });
});
