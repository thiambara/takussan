import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import { PhoneInput } from '../phone-input';

/**
 * TCK-566 — l'indicatif est un PRÉFIXE affiché, jamais un morceau de la
 * valeur éditable. C'est ce qui rend l'ordre « indicatif puis chiffres »
 * indépendant de l'endroit où la personne pose son curseur.
 */
function Banc({ initial = '', indicatif = '+221' }: { initial?: string; indicatif?: string }) {
  const [valeur, setValeur] = useState(initial);
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <label htmlFor="tel">Numéro</label>
      <PhoneInput id="tel" indicatif={indicatif} value={valeur} onValueChange={setValeur} />
      <output data-testid="valeur">{valeur}</output>
    </NextIntlClientProvider>
  );
}

describe('<PhoneInput> — TCK-566', () => {
  it('un curseur posé en TÊTE du champ ne fait pas passer l’indicatif après les chiffres', async () => {
    const user = userEvent.setup();
    render(<Banc />);
    const champ = screen.getByLabelText('Numéro');

    // Le geste exact du testeur : curseur en position 0, puis la frappe.
    await user.type(champ, '780143710', { initialSelectionStart: 0, initialSelectionEnd: 0 });

    expect(champ).toHaveValue('780143710');
    expect(screen.getByTestId('valeur')).toHaveTextContent('+221780143710');
  });

  it('affiche l’indicatif en préfixe, et le relie au champ pour les lecteurs d’écran', () => {
    render(<Banc />);
    const champ = screen.getByLabelText('Numéro');
    const prefixe = screen.getByText('+221');
    expect(champ).toHaveValue('');
    expect(champ.getAttribute('aria-describedby')).toContain(prefixe.id);
  });

  it('rien de tapé : la valeur reste vide, pas un indicatif seul', async () => {
    const user = userEvent.setup();
    render(<Banc />);
    const champ = screen.getByLabelText('Numéro');
    await user.type(champ, '7');
    await user.clear(champ);
    expect(screen.getByTestId('valeur')).toHaveTextContent(/^$/);
  });

  it('un « + » en tête passe en numéro international complet, sans préfixe affiché', async () => {
    const user = userEvent.setup();
    render(<Banc />);
    const champ = screen.getByLabelText('Numéro');
    await user.type(champ, '+33612345678');
    expect(screen.getByTestId('valeur')).toHaveTextContent('+33612345678');
    expect(champ).toHaveValue('+33612345678');
    expect(screen.queryByText('+221')).not.toBeInTheDocument();
  });

  it('une valeur enregistrée sous la forme corrompue s’affiche remise dans l’ordre', () => {
    render(<Banc initial="780143710+221" />);
    expect(screen.getByLabelText('Numéro')).toHaveValue('780143710');
    expect(screen.getByText('+221')).toBeInTheDocument();
  });
});
