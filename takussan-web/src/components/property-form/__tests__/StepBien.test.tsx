import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { StepBien } from '../wizard/steps/StepBien';

/**
 * TCK-464 — M-6 : `StepBien` n'avait AUCUN test, alors que c'est l'étape qui gouverne toutes les
 * autres (le type et le contrat pilotent la pertinence de tout le reste, via `field-matrix.ts`).
 *
 * | test | régression attrapée | pourquoi une régression ne le cocherait pas |
 * |---|---|---|
 * | 16 types rendus | un type retiré ou dupliqué en silence | rien d'autre ne compte les options |
 * | clic remplace le type | un `onChange` qui ajoute au lieu de remplacer | le formulaire enverrait un tableau, pas une valeur |
 * | vocabulaire du contrat | `property.contractTypes` recopié à la place de `property.wizard.contract` (I-3) | les deux existent, un seul est correct |
 * | sémantique radiogroup | `aria-pressed` réintroduit sur type/contrat (M-11) | un lecteur d'écran annoncerait un bouton-bascule, pas une position dans un groupe |
 * | roving tabindex | un `role="radio"` qui reste nativement tabulable, sans clavier (re-revue M-12) | seize arrêts de tabulation au lieu d'un seul — la promesse ARIA ne serait pas tenue |
 * | flèches déplacent et SÉLECTIONNENT | des flèches qui ne font rien, ou qui déplacent le focus sans sélectionner | un radiogroup natif sélectionne dès que la flèche bouge |
 */
function Harnais({
  type = 'apartment',
  contrat = 'rent',
}: {
  type?: PropertyFormValues['type'];
  contrat?: PropertyFormValues['contract_type'];
}) {
  const form = useForm<PropertyFormValues>({
    defaultValues: {
      title: '',
      type,
      contract_type: contrat,
      currency: 'XOF',
      city: '',
      furnished: false,
      tag_ids: [] as number[],
    } as PropertyFormValues,
  });
  return <StepBien form={form} />;
}

describe('StepBien', () => {
  it('rend les seize types de bien, en groupe de radios', () => {
    render(withIntl(<Harnais />));

    expect(screen.getAllByRole('radio')).toHaveLength(16 + 2); // 16 types + 2 contrats
    expect(screen.getByRole('radiogroup', { name: /type de bien/i })).toBeInTheDocument();
  });

  it('un clic sur un type le REMPLACE — une seule pastille de type reste enfoncée', async () => {
    const user = userEvent.setup();
    render(withIntl(<Harnais type="apartment" />));

    expect(screen.getByRole('radio', { name: /appartement/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /villa/i })).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('radio', { name: /villa/i }));

    expect(screen.getByRole('radio', { name: /villa/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /appartement/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('AC4 — le contrat bascule de LOUER à VENDRE et inversement', async () => {
    const user = userEvent.setup();
    render(withIntl(<Harnais contrat="rent" />));

    expect(screen.getByRole('radio', { name: /louer/i })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: /vendre/i }));

    expect(screen.getByRole('radio', { name: /vendre/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /louer/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('I-3 — le contrat emploie le vocabulaire du PARCOURS (Vendre/Louer), jamais celui de la liste (Vente/Location)', () => {
    render(withIntl(<Harnais />));

    // Une régression qui recopierait `PROPERTY_ENUM_NAMESPACES.contractType` (Vente / Location) à
    // la place de `.contractTypeWizard` (Vendre / Louer) romprait ces deux libellés — et le test
    // prescrit par la Task 9 (`getByRole('button', { name: /vendre/i })`) avec.
    expect(screen.getByRole('radio', { name: 'Vendre' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Louer' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Vente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Location' })).not.toBeInTheDocument();
  });

  it('M-11 — type et contrat n’exposent PAS `aria-pressed` : ce sont des radios, pas des boutons-bascule', () => {
    render(withIntl(<Harnais />));

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toHaveAttribute('aria-pressed');
    }
  });

  it('affiche la note sur le pays et la devise déjà renseignés', () => {
    render(withIntl(<Harnais />));
    expect(screen.getByText(/pays et la devise sont déjà renseignés/i)).toBeInTheDocument();
  });

  it('re-revue M-12 — une SEULE radio a tabIndex=0 dans chaque groupe, et c’est la sélectionnée', () => {
    render(withIntl(<Harnais type="apartment" contrat="rent" />));

    const groupeType = screen.getByRole('radiogroup', { name: /type de bien/i });
    const appartement = within(groupeType).getByRole('radio', { name: /appartement/i });
    for (const radio of within(groupeType).getAllByRole('radio')) {
      expect(radio).toHaveAttribute('tabindex', radio === appartement ? '0' : '-1');
    }

    const groupeContrat = screen.getByRole('radiogroup', { name: /vente ou location/i });
    const louer = within(groupeContrat).getByRole('radio', { name: /louer/i });
    const vendre = within(groupeContrat).getByRole('radio', { name: /vendre/i });
    expect(louer).toHaveAttribute('tabindex', '0');
    expect(vendre).toHaveAttribute('tabindex', '-1');
  });

  it('re-revue M-12 — flèche droite depuis la puce sélectionnée sélectionne et focalise la suivante', async () => {
    const user = userEvent.setup();
    render(withIntl(<Harnais type="apartment" />));

    screen.getByRole('radio', { name: /appartement/i }).focus();
    await user.keyboard('{ArrowRight}');

    const villa = screen.getByRole('radio', { name: /villa/i });
    expect(villa).toHaveAttribute('aria-checked', 'true');
    expect(villa).toHaveFocus();
    expect(screen.getByRole('radio', { name: /appartement/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('re-revue M-12 — l’enroulement mène de la DERNIÈRE puce à la première (et inversement)', async () => {
    const user = userEvent.setup();
    // Le groupe « contrat » n'a que deux options (Vendre/Louer) : la dernière et la première sont
    // les deux seules puces, donc l'enroulement s'y observe sans ambiguïté.
    render(withIntl(<Harnais contrat="rent" />));

    screen.getByRole('radio', { name: /louer/i }).focus();
    await user.keyboard('{ArrowRight}');

    const vendre = screen.getByRole('radio', { name: /vendre/i });
    expect(vendre).toHaveAttribute('aria-checked', 'true');
    expect(vendre).toHaveFocus();

    await user.keyboard('{ArrowLeft}');

    const louer = screen.getByRole('radio', { name: /louer/i });
    expect(louer).toHaveAttribute('aria-checked', 'true');
    expect(louer).toHaveFocus();
  });
});
