/**
 * Un `<FormInput type="number">` remet un NOMBRE au formulaire, pas le texte du champ.
 *
 * Relevé par la vérification adverse de TCK-571 (2026-09-24) : `Controller` transmet
 * `event.target.value`, une CHAÎNE, et une quinzaine de schémas déclarent `z.number()` — reversement,
 * facture, bail, réservation, paiements. « 50000 » tapé dans le montant brut d'un reversement
 * restait « 50000 » : la commission automatique ne se calculait jamais (`Number.isFinite("50000")`
 * est faux) et l'envoi échouait sur « Montant brut requis. », montant pourtant saisi.
 *
 * Un champ VIDE garde la chaîne vide : c'est ce que les schémas lisent déjà (`z.coerce.number`, ou
 * le message d'erreur d'un `z.number({ error })` requis), et `undefined` ferait ré-afficher la
 * valeur par défaut du formulaire (voir `FormAmountInput`).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { FormInput } from '../FormInput';

const schema = z.object({
  montant: z.number({ error: 'Montant requis.' }).positive('Montant positif.'),
  taux: z.number().min(0).max(100).optional(),
  libelle: z.string().optional(),
});
type Valeurs = z.infer<typeof schema>;

const sonde: { form?: UseFormReturn<Valeurs> } = {};
const envois: Valeurs[] = [];

function Formulaire() {
  const form = useForm<Valeurs>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as any,
    defaultValues: { montant: undefined as unknown as number, taux: undefined, libelle: '' },
  });
  useEffect(() => {
    sonde.form = form;
  });
  return (
    <form onSubmit={form.handleSubmit((v) => envois.push(v))}>
      <FormInput control={form.control} name="montant" type="number" label="Montant" />
      <FormInput control={form.control} name="taux" type="number" label="Taux" />
      <FormInput control={form.control} name="libelle" label="Libellé" />
      <button type="submit">Envoyer</button>
    </form>
  );
}

describe('FormInput type="number"', () => {
  it('remet un nombre au formulaire, et le formulaire s’envoie', async () => {
    envois.length = 0;
    const user = userEvent.setup();
    render(<Formulaire />);

    await user.type(screen.getByLabelText('Montant'), '50000');
    await user.type(screen.getByLabelText('Taux'), '12.5');

    expect(sonde.form?.getValues('montant')).toBe(50000);
    expect(sonde.form?.getValues('taux')).toBe(12.5);

    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(envois).toEqual([{ montant: 50000, taux: 12.5, libelle: '' }]);
    expect(screen.queryByText('Montant requis.')).toBeNull();
  });

  it('un champ vidé garde la chaîne vide, et le message du schéma s’affiche', async () => {
    envois.length = 0;
    const user = userEvent.setup();
    render(<Formulaire />);

    const champ = screen.getByLabelText('Montant');
    await user.type(champ, '5');
    await user.clear(champ);

    expect(sonde.form?.getValues('montant')).toBe('');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(envois).toEqual([]);
    expect(await screen.findByText('Montant requis.')).toBeInTheDocument();
  });

  it('un champ texte garde son texte', async () => {
    const user = userEvent.setup();
    render(<Formulaire />);

    await user.type(screen.getByLabelText('Libellé'), '42');
    expect(sonde.form?.getValues('libelle')).toBe('42');
  });
});
