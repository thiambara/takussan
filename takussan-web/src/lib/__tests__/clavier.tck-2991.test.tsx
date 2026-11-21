/**
 * ADR-0135 (TCK-2991) — les profils de clavier, et ce que les primitives en font.
 *
 * Le clavier ouvert, seul un téléphone le juge (ADR-0135, « Conséquences ») ; ici, les ATTRIBUTS qui le
 * commandent, et la valeur qu'un champ numérique remet au formulaire.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FormInput, lireNombre } from '@/components/forms/FormInput';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Textarea } from '@/components/ui/textarea';
import { PROFILS, profil } from '@/lib/clavier';
import { withIntl } from '@/test/intl';

describe('ADR-0135 § 1 — la table des profils', () => {
  it('la recherche : ni correction, ni majuscule, touche « Rechercher »', () => {
    expect(PROFILS.recherche).toEqual({
      type: 'search',
      inputMode: 'search',
      enterKeyHint: 'search',
      autoComplete: 'off',
      autoCorrect: 'off',
      autoCapitalize: 'none',
      spellCheck: false,
    });
  });

  it('aucun profil numérique n’est un `type="number"` : un champ texte au pavé numérique', () => {
    for (const nom of ['entier', 'decimal', 'montant', 'code'] as const) {
      expect(PROFILS[nom].type).toBe('text');
      expect(['numeric', 'decimal']).toContain(PROFILS[nom].inputMode);
    }
    expect(PROFILS.decimal.inputMode).toBe('decimal');
    expect(PROFILS.montant.inputMode).toBe('numeric');
  });

  it('la saisie automatique propose le bon renseignement', () => {
    expect(PROFILS.telephone.autoComplete).toBe('tel-national');
    expect(PROFILS.courriel.autoComplete).toBe('email');
    expect(PROFILS.code.autoComplete).toBe('one-time-code');
    expect(PROFILS['mot-de-passe'].autoComplete).toBe('current-password');
    expect(PROFILS['nouveau-mot-de-passe'].autoComplete).toBe('new-password');
    expect(PROFILS.nom.autoComplete).toBe('name');
  });

  it('une phrase et une zone de texte gardent la correction ; le composeur envoie', () => {
    expect(PROFILS.phrase).toMatchObject({ autoCorrect: 'on', autoCapitalize: 'sentences', spellCheck: true });
    expect(PROFILS['texte-long']).toMatchObject({ autoCorrect: 'on', enterKeyHint: 'enter' });
    expect(PROFILS.message.enterKeyHint).toBe('send');
  });

  it('`profil()` rend les attributs et le nom en `data-profil`, pour un champ natif', () => {
    expect(profil('code')).toEqual({ ...PROFILS.code, 'data-profil': 'code' });
  });
});

describe('ADR-0135 § 2 — la prop `profil` des primitives', () => {
  it('`Input` pose les attributs du profil et `data-profil`', () => {
    render(<Input aria-label="Chercher" profil="recherche" />);
    const champ = screen.getByLabelText('Chercher');
    expect(champ).toHaveAttribute('type', 'search');
    expect(champ).toHaveAttribute('inputmode', 'search');
    expect(champ).toHaveAttribute('enterkeyhint', 'search');
    expect(champ).toHaveAttribute('autocorrect', 'off');
    expect(champ).toHaveAttribute('autocapitalize', 'none');
    expect(champ).toHaveAttribute('spellcheck', 'false');
    expect(champ).toHaveAttribute('data-profil', 'recherche');
  });

  it('l’appelant surcharge `autoComplete` et `enterKeyHint`, et le `type` d’un mot de passe qu’on affiche', () => {
    render(
      <>
        <Input aria-label="Prénom" profil="nom" autoComplete="given-name" enterKeyHint="done" />
        <Input aria-label="Mot de passe" profil="mot-de-passe" type="text" />
      </>,
    );
    expect(screen.getByLabelText('Prénom')).toHaveAttribute('autocomplete', 'given-name');
    expect(screen.getByLabelText('Prénom')).toHaveAttribute('enterkeyhint', 'done');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('`Textarea` prend `texte-long` ou `message`', () => {
    render(<Textarea aria-label="Votre message" profil="message" />);
    expect(screen.getByLabelText('Votre message')).toHaveAttribute('enterkeyhint', 'send');
    expect(screen.getByLabelText('Votre message')).toHaveAttribute('data-profil', 'message');
  });

  it('`PhoneInput` porte le profil `telephone` et un exemple de numéro', () => {
    function Telephone() {
      const [valeur, setValeur] = useState('');
      return <PhoneInput aria-label="Téléphone" value={valeur} onValueChange={setValeur} />;
    }
    render(withIntl(<Telephone />));
    const champ = screen.getByLabelText('Téléphone');
    expect(champ).toHaveAttribute('data-profil', 'telephone');
    expect(champ).toHaveAttribute('type', 'tel');
    expect(champ).toHaveAttribute('autocomplete', 'tel-national');
    expect(champ).toHaveAttribute('placeholder', '77 123 45 67');
  });
});

describe('ADR-0135 § 1 — un profil numérique remet un NOMBRE au formulaire', () => {
  const schema = z.object({ surface: z.number({ error: 'Surface requise.' }), taux: z.number().optional(), note: z.string() });
  type Valeurs = z.infer<typeof schema>;
  const sonde: { form?: UseFormReturn<Valeurs> } = {};

  function Formulaire() {
    const form = useForm<Valeurs>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver: zodResolver(schema as any) as any,
      defaultValues: { surface: undefined as unknown as number, taux: undefined, note: '' },
    });
    useEffect(() => {
      sonde.form = form;
    });
    return (
      <form>
        <FormInput control={form.control} name="surface" label="Surface" profil="entier" placeholder="120" />
        <FormInput control={form.control} name="taux" label="Taux" profil="decimal" placeholder="12,5" />
        <FormTextarea control={form.control} name="note" label="Note" profil="texte-long" placeholder="…" />
      </form>
    );
  }

  it('« 1 500 » part en 1500, et le champ garde ce qui a été tapé', async () => {
    const user = userEvent.setup();
    render(<Formulaire />);
    const surface = screen.getByLabelText('Surface');
    expect(surface).toHaveAttribute('inputmode', 'numeric');
    expect(surface).toHaveAttribute('type', 'text');
    await user.type(surface, '1 500');
    expect(sonde.form?.getValues('surface')).toBe(1500);
    expect(surface).toHaveValue('1 500');
  });

  it('la virgule d’un décimal reste affichée pendant la frappe ; « 12,5 » part en 12.5', async () => {
    const user = userEvent.setup();
    render(<Formulaire />);
    const taux = screen.getByLabelText('Taux');
    await user.type(taux, '12,');
    expect(taux).toHaveValue('12,');
    await user.type(taux, '5');
    expect(taux).toHaveValue('12,5');
    expect(sonde.form?.getValues('taux')).toBe(12.5);
  });

  it('`FormTextarea` transmet son profil', () => {
    render(<Formulaire />);
    expect(screen.getByLabelText('Note')).toHaveAttribute('data-profil', 'texte-long');
  });

  it('`lireNombre` : vide ou illisible, la chaîne telle quelle, que le schéma juge', () => {
    expect(lireNombre('')).toBe('');
    expect(lireNombre('abc')).toBe('abc');
    expect(lireNombre('150 000')).toBe(150000);
    expect(lireNombre('0,75')).toBe(0.75);
  });
});
