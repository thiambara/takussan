/**
 * TCK-2819 (lot 2) — l'étape du prix d'après la maquette `app-entree-publier` (écran a-3) : le loyer
 * suivi de « Par Mois / Semaine / Jour / An », puis l'encadré « Coût d’entrée » à compteurs et son
 * « Total à l’entrée ».
 *
 * Les assertions de TCK-633 sur le coût d'entrée (composantes, total indicatif, note « l'annonce
 * publiée fait foi ») vivaient sur la carte d'aperçu (`ApercuAnnonce.test.tsx`) ; la carte n'en garde
 * que « À l’entrée : … » (maquette `CarteApercu`), elles sont ici, à l'encadré qui les porte.
 *
 * | test | régression attrapée |
 * |---|---|
 * | loyer et pastilles | « Prix » + « Fréquence » en liste d'avant ; une pastille qui ne change pas `rent_period` |
 * | vente | une fréquence demandée pour un prix de vente |
 * | composantes + total + note (TCK-633) | une information du coût d'entrée perdue en quittant la carte |
 * | charges et demi-mois (TCK-633) | un total qui ne compte pas les charges de l'avance, ou un compteur à pas entier pour les frais |
 * | compteurs | un compteur qui n'écrit pas le formulaire, ou qui descend sous zéro |
 * | hors location mensuelle | un coût d'entrée qu'on laisse saisir et que l'API refuserait |
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { StepPrix } from '../wizard/steps/StepPrix';

function monter(defauts: Partial<PropertyFormValues>, fraisDAgence?: boolean) {
  const sortie: { form?: UseFormReturn<PropertyFormValues> } = {};
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', type: 'apartment', contract_type: 'rent', rent_period: 'monthly', currency: 'XOF',
        city: 'Dakar', furnished: false, tag_ids: [],
        ...defauts,
      } as PropertyFormValues,
    });
    sortie.form = form;
    return <StepPrix form={form} fraisDAgence={fraisDAgence} />;
  }
  render(withIntl(<Harnais />));
  return () => sortie.form!;
}

const encadre = () => within(screen.getByTestId('encadre-cout-d-entree'));

describe('StepPrix — le loyer et sa fréquence (maquette a-3)', () => {
  it('en location : « Loyer » en F CFA, puis « Par » Mois / Semaine / Jour / An en pastilles', async () => {
    const form = monter({ price: 250_000 });
    const user = userEvent.setup();

    expect((screen.getByLabelText(/^loyer/i) as HTMLInputElement).value).toMatch(/^250\s000$/);
    expect(screen.getByLabelText(/^loyer/i)).toHaveAccessibleDescription(/F CFA/);
    const groupe = screen.getByRole('radiogroup', { name: 'Fréquence' });
    expect(within(groupe).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Mois', 'Semaine', 'Jour', 'An']);
    expect(within(groupe).getByRole('radio', { name: 'Mois' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Par')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /fréquence/i })).not.toBeInTheDocument();

    await user.click(within(groupe).getByRole('radio', { name: 'Semaine' }));
    expect(form().getValues('rent_period')).toBe('weekly');
    expect(form().getFieldState('rent_period').isDirty).toBe(true);
  });

  it('en vente : « Prix », sans fréquence', () => {
    monter({ contract_type: 'sale', rent_period: undefined });

    expect(screen.getByLabelText(/^prix/i)).toBeInTheDocument();
    expect(screen.getByTestId('bloc-location')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('StepPrix — l’encadré du coût d’entrée (TCK-633, déplacé de la carte d’aperçu)', () => {
  it('liste les composantes du coût d’entrée, ET son total indicatif', () => {
    monter({ price: 450_000, advance_months: 2, deposit_months: 1, agency_fee_months: 1 });

    expect(encadre().getByText('2 mois d’avance, 1 mois de caution, 1 mois de frais d’agence')).toBeInTheDocument();
    // 4 × 450 000 = 1 800 000 : le montant que `CoutDEntree` (API) rend pour la même entrée.
    expect(encadre().getByTestId('total-a-l-entree')).toHaveTextContent(/^1\s800\s000\sF CFA$/);
    expect(encadre().getByText('Total à l’entrée')).toBeInTheDocument();
    expect(encadre().getByText(/montant indicatif, calculé d’après vos réponses/i)).toBeInTheDocument();
  });

  it('le total compte les charges de l’avance et le demi-mois de frais', () => {
    monter({ price: 450_000, advance_months: 1, deposit_months: 1, agency_fee_months: 1.5, monthly_charges: 10_000 });

    // (450 000 + 10 000) × 1 + 450 000 × 1 + 450 000 × 1,5 = 1 585 000
    expect(encadre().getByTestId('total-a-l-entree')).toHaveTextContent(/1\s585\s000\sF CFA/);
  });

  it('chaque compteur écrit le formulaire, montre son montant, et ne descend pas sous zéro', async () => {
    const form = monter({ price: 250_000, advance_months: 2 });
    const user = userEvent.setup();

    const avance = screen.getByRole('spinbutton', { name: 'Mois d’avance' });
    expect(avance).toHaveAttribute('aria-valuenow', '2');
    const ligne = within(avance.closest('[data-compteur]') as HTMLElement);
    expect(ligne.getByText(/^500\s000\sF CFA$/)).toBeInTheDocument();
    await user.click(ligne.getByRole('button', { name: 'Ajouter un mois' }));
    expect(form().getValues('advance_months')).toBe(3);
    expect(form().getFieldState('advance_months').isDirty).toBe(true);
    expect(avance).toHaveAttribute('aria-valuenow', '3');

    const caution = screen.getByRole('spinbutton', { name: 'Mois de caution' });
    const moinsCaution = within(caution.closest('[data-compteur]') as HTMLElement).getByRole('button', { name: 'Retirer un mois' });
    expect(moinsCaution).toBeDisabled();

    // Au clavier, comme un `spinbutton` : flèche haut, flèche bas.
    caution.focus();
    await user.keyboard('{ArrowDown}');
    expect(form().getValues('deposit_months')).toBeUndefined(); // zéro = absent, jamais négatif
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}');
    expect(form().getValues('deposit_months')).toBe(1);
  });

  it('les frais d’agence avancent d’un demi-mois', async () => {
    const form = monter({ price: 250_000 });
    const user = userEvent.setup();

    const frais = screen.getByRole('spinbutton', { name: /frais d.agence/i });
    await user.click(within(frais.closest('[data-compteur]') as HTMLElement).getByRole('button', { name: 'Ajouter un demi-mois' }));
    expect(form().getValues('agency_fee_months')).toBe(0.5);
  });

  it('les charges se saisissent en F CFA', () => {
    monter({ price: 250_000, monthly_charges: 15_000 });

    expect((encadre().getByLabelText(/charges mensuelles/i) as HTMLInputElement).value).toMatch(/^15\s000$/);
  });

  it('hors location mensuelle, aucun coût d’entrée — l’API les refuserait', () => {
    monter({ rent_period: 'weekly', price: 50_000, advance_months: 2 });

    expect(screen.getByTestId('bloc-cout-d-entree')).toHaveAttribute('aria-hidden', 'true');
  });
});
