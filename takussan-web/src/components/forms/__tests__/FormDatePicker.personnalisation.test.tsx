import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import { FormDatePicker } from '../FormDatePicker';
import { FormInput } from '../FormInput';

/**
 * TCK-468 AC2 — « `FormDatePicker` accepte la même personnalisation que les autres champs ».
 *
 * « La même » est le mot qui compte, et c'est pourquoi ce fichier monte les DEUX composants dans
 * le même test plutôt que d'affirmer une propriété du seul sélecteur de date : l'AC est une
 * relation entre deux champs, pas une propriété de l'un d'eux. Avant ce ticket, `className`
 * atterrissait sur l'`<input>` côté `FormInput` et sur une ENVELOPPE côté `FormDatePicker` — deux
 * composants qui acceptent la même prop et n'en font pas la même chose, ce qui est pire qu'une
 * prop absente : ça ne se voit ni au typage, ni au lint, ni à la lecture de l'appel.
 */
type Valeurs = { readonly quand: string; readonly quoi: string };

function Harnais() {
  const { control } = useForm<Valeurs>({ defaultValues: { quand: '', quoi: '' } });
  return (
    <>
      <FormInput
        control={control}
        name="quoi"
        label="Quoi"
        className="marque-cible"
        containerClassName="marque-enveloppe-input"
      />
      <FormDatePicker
        control={control}
        name="quand"
        label="Quand"
        className="marque-cible"
        containerClassName="marque-enveloppe-date"
      />
    </>
  );
}

describe('AC2 — `className` désigne la même chose sur les deux champs', () => {
  it('la cible cliquable, dans les deux cas — et l’enveloppe reste distincte', () => {
    const { container } = render(withIntl(<Harnais />));

    const texte = screen.getByLabelText('Quoi');
    const date = screen.getByLabelText('Quand');

    expect(texte.tagName).toBe('INPUT');
    // Côté date, la cible est un bouton qui ouvre le calendrier : c'est LUI que le doigt vise.
    expect(date.tagName).toBe('BUTTON');
    expect(date).toHaveAttribute('data-slot', 'date-picker-trigger');

    for (const cible of [texte, date]) {
      expect(cible.className).toContain('marque-cible');
    }

    // Et `containerClassName` reste ce qu'il est ailleurs : l'enveloppe libellé + champ + erreur.
    for (const marque of ['marque-enveloppe-input', 'marque-enveloppe-date']) {
      const enveloppe = container.querySelector(`.${marque}`);
      expect(enveloppe, marque).not.toBeNull();
      expect(enveloppe!.className).not.toContain('marque-cible');
    }
  });
});
