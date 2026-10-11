import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { BarreApercu, CarteApercu, ListePourPublier } from '../wizard/ApercuAnnonce';

/**
 * TCK-631 (piste 6) — l'aperçu de l'annonce, à côté des questions.
 *
 * | test | régression attrapée |
 * |---|---|
 * | titre proposé | une carte vide jusqu'à la dernière étape, alors que le parcours sait déjà quoi y mettre |
 * | lieu et prix « à venir » | une carte trouée qui ressemble à une panne |
 * | période d'un loyer | « 450 000 F CFA » sans « /mois » — un loyer porte toujours sa période |
 * | vente sans période | un « /mois » collé à un prix de vente |
 * | coût d'entrée SANS total | un second calcul de la formule de `CoutDEntree` (TCK-598), qui finirait par contredire la fiche |
 * | coût d'entrée hors location mensuelle | des composantes que l'API refuse (422) affichées comme acquises |
 * | liste : étape franchie rouvrable | la perte du geste que portait le rail d'étapes |
 * | barre : ouvre la carte | un aperçu inaccessible sous `lg` |
 */
function Harnais({
  valeurs = {},
  rendu,
}: {
  valeurs?: Partial<PropertyFormValues>;
  rendu: (form: ReturnType<typeof useForm<PropertyFormValues>>) => React.ReactNode;
}) {
  const form = useForm<PropertyFormValues>({
    defaultValues: {
      title: '', currency: 'XOF', city: '', quarter: '', furnished: false, tag_ids: [],
      ...valeurs,
    } as PropertyFormValues,
  });
  return <>{rendu(form)}</>;
}

function carte(valeurs: Partial<PropertyFormValues>) {
  render(withIntl(<Harnais valeurs={valeurs} rendu={(form) => <CarteApercu form={form} photos={[]} />} />));
  return within(screen.getByTestId('apercu-annonce'));
}

describe('CarteApercu', () => {
  it('avant toute réponse : « Votre annonce », lieu et prix à venir', () => {
    const c = carte({});
    expect(c.getByText('Votre annonce')).toBeInTheDocument();
    expect(c.getByText('Lieu à venir')).toBeInTheDocument();
    expect(c.getByText('Prix à venir')).toBeInTheDocument();
  });

  it('montre le titre que la dernière étape proposera, et le contrat en pastille', () => {
    const c = carte({ type: 'apartment', contract_type: 'rent', bedrooms: 3, quarter: 'Almadies', city: 'Dakar' });
    expect(c.getByText('Appartement 3 chambres à Almadies')).toBeInTheDocument();
    expect(c.getByText('Almadies, Dakar')).toBeInTheDocument();
    expect(c.getByText('En location')).toBeInTheDocument();
  });

  it('préfère le titre SAISI au titre proposé', () => {
    const c = carte({ type: 'villa', contract_type: 'sale', title: 'Villa vue mer' });
    expect(c.getByText('Villa vue mer')).toBeInTheDocument();
  });

  it('un loyer porte sa période — mensuelle quand elle n’est pas encore choisie', () => {
    const c = carte({ type: 'apartment', contract_type: 'rent', price: 450_000 });
    expect(c.getByTestId('apercu-prix')).toHaveTextContent(/450\s000\sF CFA\s*\/mois/);
  });

  it('un prix de vente n’a pas de période', () => {
    const c = carte({ type: 'land', contract_type: 'sale', price: 25_000_000, rent_period: 'monthly' });
    expect(c.getByTestId('apercu-prix')).toHaveTextContent(/25\s000\s000\sF CFA$/);
  });

  it('liste les composantes du coût d’entrée, SANS en refaire le total (TCK-598)', () => {
    const c = carte({
      type: 'apartment', contract_type: 'rent', rent_period: 'monthly', price: 450_000,
      advance_months: 2, deposit_months: 1, agency_fee_months: 1,
    });
    expect(c.getByText('2 mois d’avance, 1 mois de caution, 1 mois de frais d’agence')).toBeInTheDocument();
    // 4 × 450 000 = 1 800 000 : le montant que la formule de l'API rendrait. Il ne doit PAS
    // apparaître — seule l'API l'additionne, avec son arrondi.
    expect(c.queryByText(/1\s800\s000/)).not.toBeInTheDocument();
    expect(c.getByText(/total s’affiche sur l’annonce publiée/i)).toBeInTheDocument();
  });

  it('hors location mensuelle, aucun coût d’entrée — l’API les refuserait', () => {
    const c = carte({
      type: 'apartment', contract_type: 'rent', rent_period: 'weekly', price: 50_000, advance_months: 2,
    });
    expect(c.queryByText(/mois d’avance/)).not.toBeInTheDocument();
  });
});

describe('ListePourPublier', () => {
  const ETAPES = [
    { id: 'bien', libelle: 'Le type et le contrat' },
    { id: 'lieu', libelle: 'L’emplacement' },
    { id: 'photos', libelle: 'Les photos', facultative: true },
  ];

  it('une étape franchie se rouvre ; la courante et les suivantes ne sont pas des boutons', async () => {
    const user = userEvent.setup();
    const onRouvrir = vi.fn();
    render(withIntl(<ListePourPublier etapes={ETAPES} index={1} onRouvrir={onRouvrir} />));

    await user.click(screen.getByRole('button', { name: 'Revenir à : Le type et le contrat' }));
    expect(onRouvrir).toHaveBeenCalledWith(0);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText(/L’emplacement/).closest('[aria-current="step"]')).not.toBeNull();
    expect(screen.getByText(/facultatif/)).toBeInTheDocument();
  });
});

describe('BarreApercu', () => {
  it('résume l’annonce, et ouvre la carte entière dans un tiroir', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <Harnais
          valeurs={{ type: 'apartment', contract_type: 'rent', price: 450_000, city: 'Dakar' }}
          rendu={(form) => (
            <BarreApercu form={form} photos={[]}>
              {() => <p>liste</p>}
            </BarreApercu>
          )}
        />,
      ),
    );

    const barre = screen.getByRole('button', { name: 'Ouvrir l’aperçu de l’annonce' });
    expect(barre).toHaveTextContent(/450\s000\sF CFA \/mois/);
    expect(screen.queryByTestId('apercu-annonce')).not.toBeInTheDocument();

    await user.click(barre);

    const tiroir = await screen.findByRole('dialog');
    expect(within(tiroir).getByTestId('apercu-annonce')).toBeInTheDocument();
    expect(within(tiroir).getByText('liste')).toBeInTheDocument();
  });
});
