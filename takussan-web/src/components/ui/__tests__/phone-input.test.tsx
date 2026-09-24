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

  // TCK-574 — le 0 de préfixe national est retiré de la VALEUR (`+33612345678`),
  // pas de ce que la personne voit : un chiffre qui disparaît sous les doigts se
  // retape, et le champ ne doit pas avaler une frappe.
  it('sous +33, « 0612345678 » vaut +33612345678, et le 0 tapé reste à l’écran', async () => {
    const user = userEvent.setup();
    render(<Banc indicatif="+33" />);
    const champ = screen.getByLabelText('Numéro');

    await user.type(champ, '0');
    expect(champ).toHaveValue('0');
    expect(screen.getByTestId('valeur')).toHaveTextContent(/^$/);

    await user.type(champ, '612345678');
    expect(champ).toHaveValue('0612345678');
    expect(screen.getByTestId('valeur')).toHaveTextContent('+33612345678');
    expect(screen.getByText('+33')).toBeInTheDocument();
  });

  it('sous +39, le 0 est un chiffre du numéro et reste dans la valeur', async () => {
    const user = userEvent.setup();
    render(<Banc indicatif="+39" />);
    await user.type(screen.getByLabelText('Numéro'), '0612345678');
    expect(screen.getByTestId('valeur')).toHaveTextContent('+390612345678');
  });

  it('une valeur changée par le parent l’emporte sur la frappe en cours', async () => {
    const user = userEvent.setup();
    function BancRemis() {
      const [valeur, setValeur] = useState('');
      return (
        <NextIntlClientProvider locale="fr" messages={frMessages}>
          <label htmlFor="tel">Numéro</label>
          <PhoneInput id="tel" indicatif="+33" value={valeur} onValueChange={setValeur} />
          <button type="button" onClick={() => setValeur('+33700000000')}>
            remettre
          </button>
        </NextIntlClientProvider>
      );
    }
    render(<BancRemis />);
    const champ = screen.getByLabelText('Numéro');
    await user.type(champ, '0612');
    await user.click(screen.getByRole('button', { name: 'remettre' }));
    expect(champ).toHaveValue('700000000');
  });

  /**
   * TCK-574 repair-1 — relevé du vérificateur : « 0 » tapé sous +33 compose `''`, et un
   * parent qui remet la valeur à `''` laisse « 0 » affiché. Le mécanisme est exact, et il
   * n'a pas de correctif DANS le composant : la valeur ne change pas (`''` → `''`), donc un
   * parent contrôlé n'a rien à lui transmettre — `setState('')` sur `''` ne rend même pas.
   * Aucun assistant ne remet le téléphone à `''` (relevé : les quatre ne l'écrivent que par
   * `onValueChange`). Le contrat, écrit dans le composant, est le geste standard d'un champ
   * contrôlé dont l'affichage est plus riche que la valeur : le REMONTER (`key`).
   */
  it('vider une frappe qui ne compose rien passe par un remontage (key)', async () => {
    const user = userEvent.setup();
    function BancVide() {
      const [valeur, setValeur] = useState('');
      const [cle, setCle] = useState(0);
      return (
        <NextIntlClientProvider locale="fr" messages={frMessages}>
          <label htmlFor="tel">Numéro</label>
          <PhoneInput key={cle} id="tel" indicatif="+33" value={valeur} onValueChange={setValeur} />
          <output data-testid="valeur">{valeur}</output>
          <button
            type="button"
            onClick={() => {
              setValeur('');
              setCle((c) => c + 1);
            }}
          >
            vider
          </button>
        </NextIntlClientProvider>
      );
    }
    render(<BancVide />);
    await user.type(screen.getByLabelText('Numéro'), '0');
    expect(screen.getByLabelText('Numéro')).toHaveValue('0');
    expect(screen.getByTestId('valeur')).toHaveTextContent(/^$/);
    await user.click(screen.getByRole('button', { name: 'vider' }));
    expect(screen.getByLabelText('Numéro')).toHaveValue('');
  });

  // TCK-574 — l'écart entre le séparateur du préfixe et le premier chiffre était de 18,5 px
  // (mesuré à 320/360/390 px) pour 10 px de marge avant l'indicatif : le retrait était estimé en
  // `ch`. Il suit désormais la largeur mesurée du préfixe.
  it('le retrait du champ suit la largeur mesurée du préfixe', () => {
    const origine = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      return { width: this.id.endsWith('-indicatif') ? 51 : 0 } as DOMRect;
    };
    try {
      render(<Banc />);
      expect(screen.getByLabelText('Numéro').style.paddingInlineStart).toBe('calc(51px + 0.625rem)');
    } finally {
      HTMLElement.prototype.getBoundingClientRect = origine;
    }
  });

  it('sans mise en page mesurable, le retrait retombe sur l’estimation', () => {
    render(<Banc />);
    expect(screen.getByLabelText('Numéro').style.paddingInlineStart).toBe('calc(4ch + 1.625rem)');
  });
});
