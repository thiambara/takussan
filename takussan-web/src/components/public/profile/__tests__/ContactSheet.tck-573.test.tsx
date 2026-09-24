import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { ContactSheet } from '../ContactSheet';

type SoumissionAgent = (
  slug: string,
  payload: { name: string; email: string; message: string },
) => Promise<{ ok: true }>;

const submitAgentContactLead = vi.fn<SoumissionAgent>(async () => ({ ok: true }));

vi.mock('@/app/actions/property', () => ({
  submitAgentContactLead: (
    slug: string,
    payload: { name: string; email: string; message: string },
  ) => submitAgentContactLead(slug, payload),
}));

/**
 * `(public)/layout.tsx` monte `ToastProvider` ET `Toaster` en production ; sans le second, le toast
 * est posé dans le magasin mais jamais rendu, et son texte est invisible au test.
 */
function monte(ui: React.ReactElement, locale: LocaleDeTest = 'fr') {
  return render(
    withIntl(
      <ToastProvider>
        {ui}
        <Toaster />
      </ToastProvider>,
      locale,
    ),
  );
}

/** Ouvre le formulaire anonyme, l'envoie, et rend le texte du dialogue lu AVANT l'envoi. */
async function ouvreEtEnvoie(): Promise<string> {
  const user = userEvent.setup();
  // Le premier bouton est celui du bureau (« Envoyer un email ») ; le bouton mobile est derrière
  // la feuille, que jsdom ne sait pas masquer par `md:hidden`.
  await user.click(screen.getAllByRole('button')[0]!);
  const dialogue = await screen.findByRole('dialog');
  const texte = dialogue.textContent ?? '';

  await user.type(within(dialogue).getByLabelText(/nom|name|tur/i), 'Moussa Fall');
  await user.type(within(dialogue).getByLabelText(/e-?mail/i), 'moussa@example.test');
  await user.type(within(dialogue).getByLabelText(/message|bataaxal/i), 'Bonjour, je cherche un F3.');
  await user.click(within(dialogue).getByRole('button', { name: /envoyer|send|yónnee/i }));

  return texte;
}

/**
 * TCK-573 — sur la fiche d'un PROPRIÉTAIRE, le contact ne le présente plus comme un agent.
 *
 * Relevé par la vérification (CDP 1366, `/fr/agents/owner.agency4`, `public_role = owner`) : le
 * dialogue disait « Vos coordonnées sont transmises à l'agent du bien », et le toast de succès
 * « L'agent vous recontactera sous peu » — les deux libellés par défaut du formulaire partagé
 * `AnonymousLeadDialog`, que `ContactSheet` ne surchargeait pas.
 */
describe('ContactSheet — qualité du destinataire (TCK-573)', () => {
  beforeEach(() => submitAgentContactLead.mockClear());

  it('un propriétaire : dialogue et toast le nomment propriétaire, jamais agent', async () => {
    monte(<ContactSheet name="Property Owner" agentSlug="owner.agency4" recipientRole="owner" />);

    const dialogue = await ouvreEtEnvoie();

    expect(dialogue).toContain('Vos coordonnées sont transmises à ce propriétaire.');
    expect(dialogue).not.toMatch(/agent/i);
    expect(await screen.findByText('Le propriétaire vous recontactera sous peu.')).toBeInTheDocument();
    expect(screen.queryByText(/L'agent vous recontactera/)).not.toBeInTheDocument();
    expect(submitAgentContactLead).toHaveBeenCalledTimes(1);
  });

  it('un rôle absent retombe sur « propriétaire » — seul un `agent` explicite est agent', async () => {
    monte(<ContactSheet name="Property Owner" agentSlug="owner.agency4" />);

    const dialogue = await ouvreEtEnvoie();

    expect(dialogue).toContain('ce propriétaire');
    expect(await screen.findByText('Le propriétaire vous recontactera sous peu.')).toBeInTheDocument();
  });

  it('le contrôle : un agent reste nommé agent — sans lui, « propriétaire partout » passerait', async () => {
    monte(<ContactSheet name="Awa Ndiaye" agentSlug="awa-ndiaye" recipientRole="agent" />);

    const dialogue = await ouvreEtEnvoie();

    expect(dialogue).toContain('Vos coordonnées sont transmises à cet agent.');
    // « du bien » : il n'y a pas de bien sur une fiche de personne.
    expect(dialogue).not.toContain('du bien');
    expect(await screen.findByText("L'agent vous recontactera sous peu.")).toBeInTheDocument();
  });

  it('en anglais aussi, le propriétaire est un « owner »', async () => {
    monte(
      <ContactSheet name="Property Owner" agentSlug="owner.agency4" recipientRole="owner" />,
      'en',
    );

    const dialogue = await ouvreEtEnvoie();

    expect(dialogue).toContain('Your details are forwarded to this owner.');
    expect(dialogue).not.toMatch(/agent/i);
    expect(await screen.findByText('The owner will get back to you shortly.')).toBeInTheDocument();
  });
});
