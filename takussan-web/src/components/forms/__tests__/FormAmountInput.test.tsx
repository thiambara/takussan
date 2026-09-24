import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { FormAmountInput } from '../FormAmountInput';

/**
 * TCK-564 (W10) — le champ de montant : ce qu'il AFFICHE et ce qu'il REND au formulaire.
 *
 * Les conversions elles-mêmes sont testées dans `lib/__tests__/saisie-montant.test.ts` ; ici, le
 * branchement : la frappe, le curseur, la valeur remise à react-hook-form, et une valeur posée
 * depuis l'extérieur (brouillon repris, `reset`).
 */
const FINE = '\u202f';

type Valeurs = { price: unknown; currency: string };

function monter(
  defauts: Partial<Valeurs> = {},
  options: { locale?: LocaleDeTest; erreur?: string } = {},
) {
  const sonde: { form?: UseFormReturn<Valeurs> } = {};
  function Hote() {
    const form = useForm<Valeurs>({ defaultValues: { price: undefined, currency: 'XOF', ...defauts } });
    sonde.form = form;
    const devise = form.watch('currency');
    return (
      <>
        <FormAmountInput control={form.control} name="price" label="Prix" required currency={devise} example={25_000_000} />
        <button type="button" onClick={() => form.reset({ price: 7_000_000, currency: 'XOF' })}>
          reprendre
        </button>
        <button type="button" onClick={() => form.setError('price', { message: options.erreur ?? 'Requis' })}>
          invalider
        </button>
      </>
    );
  }
  render(withIntl(<Hote />, options.locale));
  return { sonde, champ: () => screen.getByLabelText(/^prix/i) as HTMLInputElement };
}

describe('FormAmountInput', () => {
  it('se relit pendant la frappe, et rend un NOMBRE au formulaire', async () => {
    const user = userEvent.setup();
    const { sonde, champ } = monter();

    await user.type(champ(), '49000000');

    expect(champ().value).toBe(`49${FINE}000${FINE}000`);
    expect(sonde.form?.getValues('price')).toBe(49_000_000);
  });

  it('est un champ TEXTE au clavier numérique — un `type="number"` refuse tout séparateur', () => {
    const { champ } = monter();
    expect(champ()).toHaveAttribute('type', 'text');
    expect(champ()).toHaveAttribute('inputmode', 'numeric');
  });

  it('corrige un chiffre au MILIEU sans renvoyer le curseur en fin de champ', async () => {
    const user = userEvent.setup();
    const { sonde, champ } = monter({ price: 1_500_000 });
    expect(champ().value).toBe(`1${FINE}500${FINE}000`);

    // Curseur juste après le « 1 », puis « 2 » : « 12 500 000 ». Un curseur renvoyé en fin
    // écrirait le « 3 » suivant tout au bout (125 000 003).
    await user.click(champ());
    champ().setSelectionRange(1, 1);
    await user.keyboard('23');

    expect(champ().value).toBe(`123${FINE}500${FINE}000`);
    expect(sonde.form?.getValues('price')).toBe(123_500_000);
  });

  it('un champ vidé RESTE vide — l’ancien prix ne reparaît pas — et rend `null`, pas 0', async () => {
    const user = userEvent.setup();
    const { sonde, champ } = monter({ price: 350_000 });

    await user.clear(champ());

    expect(champ().value).toBe('');
    // `undefined` ferait ré-afficher la valeur par défaut du formulaire (350 000) : c'est ce que
    // ce test a attrapé à sa première exécution.
    expect(sonde.form?.getValues('price')).toBeNull();
  });

  it('une valeur posée de l’extérieur (brouillon repris) s’affiche groupée', async () => {
    const user = userEvent.setup();
    const { champ } = monter();
    await user.type(champ(), '12');

    await user.click(screen.getByRole('button', { name: 'reprendre' }));

    expect(champ().value).toBe(`7${FINE}000${FINE}000`);
  });

  it('une valeur changée AILLEURS pendant la frappe remplace le texte tapé — le champ garde le focus', async () => {
    // Le test précédent passe par un clic, qui fait perdre le focus : `onBlur` oublie alors le
    // texte tapé AVANT le `reset`, et la branche qui compare ce texte à la valeur n'est jamais
    // exercée (relevé par la revue adverse, mutation survivante). Ici, le focus reste au champ.
    const user = userEvent.setup();
    const { sonde, champ } = monter();
    await user.type(champ(), '12');
    expect(champ()).toHaveFocus();

    act(() => sonde.form?.setValue('price', 7_000_000));

    expect(champ()).toHaveFocus();
    expect(champ().value).toBe(`7${FINE}000${FINE}000`);
  });

  it('des centimes COLLÉS en franc CFA tombent — ils ne multiplient pas le prix par 100', async () => {
    const user = userEvent.setup();
    const { sonde, champ } = monter();
    await user.click(champ());

    await user.paste('1 500,00');

    expect(champ().value).toBe(`1${FINE}500`);
    expect(sonde.form?.getValues('price')).toBe(1500);
  });

  it('un brouillon d’avant le correctif (prix en CHAÎNE) s’affiche groupé lui aussi', () => {
    const { champ } = monter({ price: '7000000' });
    expect(champ().value).toBe(`7${FINE}000${FINE}000`);
  });

  it('en euros, la virgule décimale tient, et le clavier propose la virgule', async () => {
    const user = userEvent.setup();
    const { sonde, champ } = monter({ currency: 'EUR' });
    expect(champ()).toHaveAttribute('inputmode', 'decimal');

    await user.type(champ(), '1500,5');

    expect(champ().value).toBe(`1${FINE}500,5`);
    expect(sonde.form?.getValues('price')).toBe(1500.5);
  });

  // Revue adverse, 3ᵉ passe : mesuré au clavier sur ce composant, une frappe de l'AUTRE signe
  // derrière des décimales multipliait le prix par 10 ou 100 (« 1500,5. » → 15 005).
  it.each([
    ['1500,5.', 'fr', `1${FINE}500,5`],
    ['1500,50.', 'fr', `1${FINE}500,50`],
    ['1500.5,', 'en', '1,500.5'],
  ] as const)('en euros, « %s » (%s) : l’autre signe tapé de trop ne change pas l’ordre de grandeur', async (frappe, locale, affichage) => {
    const user = userEvent.setup();
    const { sonde, champ } = monter({ currency: 'EUR' }, { locale });

    await user.type(champ(), frappe);

    expect(champ().value).toBe(affichage);
    expect(sonde.form?.getValues('price')).toBe(1500.5);
  });

  // Revue adverse v2 : la règle « trois chiffres derrière le point groupent » ne jouait que pour un
  // texte COLLÉ. Au clavier, « 1. » devenait « 1, » avant que le moindre chiffre suive : « 1.500 »
  // tapé valait 1,50 €, « 150.000 » 150 €, et « ,50 » était ensuite avalé. Ces cas FRAPPENT.
  it.each([
    ['1.500', 'fr', `1${FINE}500`, 1500],
    ['150.000', 'fr', `150${FINE}000`, 150_000],
    ['1.500,50', 'fr', `1${FINE}500,50`, 1500.5],
    ['49.000.000', 'fr', `49${FINE}000${FINE}000`, 49_000_000],
    ['1.500', 'wo', `1${FINE}500`, 1500],
    ['1,500.50', 'en', '1,500.50', 1500.5],
  ] as const)('en euros, « %s » TAPÉ (%s) : le point suivi de trois chiffres groupe', async (frappe, locale, affichage, prix) => {
    const user = userEvent.setup();
    const { sonde, champ } = monter({ currency: 'EUR' }, { locale });

    await user.type(champ(), frappe);

    expect(champ().value).toBe(affichage);
    expect(sonde.form?.getValues('price')).toBe(prix);
  });

  it('en euros, le point tapé reste un POINT tant qu’il est ambigu, et la sortie du champ tranche', async () => {
    const user = userEvent.setup();
    const { sonde, champ } = monter({ currency: 'EUR' });

    // Le point n'est pas réécrit en virgule : rien ne dit encore s'il groupe ou s'il sépare.
    await user.type(champ(), '10.');
    expect(champ().value).toBe('10.');
    await user.type(champ(), '5');
    expect(champ().value).toBe('10.5');
    // Le formulaire porte déjà la lecture décimale : c'est elle qui partirait sur « Entrée ».
    expect(sonde.form?.getValues('price')).toBe(10.5);

    // Quitter le champ tranche pour les décimales, et l'écran le dit dans la convention française.
    await user.tab();
    expect(champ().value).toBe('10,5');
    expect(sonde.form?.getValues('price')).toBe(10.5);
  });

  it('l’exemple suit la locale : « 25 000 000 » en français, « 25,000,000 » en anglais', () => {
    const { champ } = monter();
    expect(champ()).toHaveAttribute('placeholder', `25${FINE}000${FINE}000`);
  });

  it('l’exemple suit la locale anglaise', () => {
    const { champ } = monter({}, { locale: 'en' });
    expect(champ()).toHaveAttribute('placeholder', '25,000,000');
  });

  it('relie l’erreur au champ, comme `FormInput`', async () => {
    const user = userEvent.setup();
    const { champ } = monter({}, { erreur: 'Le prix est requis' });

    await user.click(screen.getByRole('button', { name: 'invalider' }));

    expect(champ()).toHaveAttribute('aria-invalid', 'true');
    expect(champ()).toHaveAccessibleDescription('Le prix est requis');
    expect(champ()).toHaveAttribute('aria-required', 'true');
  });
});
