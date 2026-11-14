/**
 * TCK-2819 — l'aperçu de l'assistant d'après la maquette `app-entree-publier` (`CarteApercu`,
 * `PourPublier`, `Resume`), aux deux entrées : la colonne du bureau, le tiroir et le résumé du téléphone.
 *
 * | test | régression attrapée |
 * |---|---|
 * | carte compacte | une photo 4/3 qui fait sortir « Pour publier » de la hauteur de la colonne collante |
 * | pastille et compteur | le contrat en `ContractTypeChip` d'avant, ou un compteur de photos absent |
 * | prix et entrée | « /mois » collé au prix, ou le total de l'entrée perdu |
 * | « Pour publier » | le titre à 12,6 px, la note fondue dans le libellé (« · en cours ») |
 * | résumé | le titre proposé à la place de « Studio · En location · Mermoz » |
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { BarreApercu, CarteApercu, ListePourPublier } from '../wizard/ApercuAnnonce';

function Harnais({
  valeurs = {},
  rendu,
}: {
  valeurs?: Partial<PropertyFormValues>;
  rendu: (form: ReturnType<typeof useForm<PropertyFormValues>>) => React.ReactNode;
}) {
  const form = useForm<PropertyFormValues>({
    defaultValues: { title: '', currency: 'XOF', city: '', quarter: '', furnished: false, tag_ids: [], ...valeurs } as PropertyFormValues,
  });
  return <>{rendu(form)}</>;
}

const STUDIO: Partial<PropertyFormValues> = {
  type: 'studio', contract_type: 'rent', rent_period: 'monthly', city: 'Dakar', quarter: 'Mermoz',
  price: 250_000, advance_months: 2, deposit_months: 2, monthly_charges: 15_000,
};
const photo = (n: string) => new File(['x'], n, { type: 'image/jpeg' });

describe('CarteApercu (maquette `CarteApercu`)', () => {
  it('compacte dans la colonne : photo 16/9 à fond perdu, « Vos photos viendront ici »', () => {
    render(withIntl(<Harnais valeurs={{ type: 'studio' }} rendu={(f) => <CarteApercu form={f} photos={[]} compact />} />));
    const carte = screen.getByTestId('apercu-annonce');
    expect(carte).toHaveClass('overflow-hidden', 'rounded-xl', 'border');
    expect(carte.firstElementChild).toHaveClass('aspect-video');
    expect(within(carte).getByText('Vos photos viendront ici')).toHaveClass('text-sm');
  });

  it('dans le tiroir, la photo garde son 4/3', () => {
    render(withIntl(<Harnais rendu={(f) => <CarteApercu form={f} photos={[]} />} />));
    expect(screen.getByTestId('apercu-annonce').firstElementChild).toHaveClass('aspect-[4/3]');
  });

  it('la pastille « En location », le compteur « 1 / 2 », le titre, le lieu, le prix « / mois » et l’entrée', () => {
    render(withIntl(<Harnais valeurs={STUDIO} rendu={(f) => <CarteApercu form={f} photos={[photo('a.jpg'), photo('b.jpg')]} compact />} />));
    const c = within(screen.getByTestId('apercu-annonce'));
    expect(c.getByText('En location')).toHaveClass('rounded-full', 'bg-card', 'text-xs', 'font-semibold');
    expect(c.getByText('1 / 2')).toBeInTheDocument();
    expect(c.getByText('Studio à Mermoz')).toHaveClass('font-display', 'text-titre-court', 'font-semibold');
    expect(c.getByText('Mermoz, Dakar')).toBeInTheDocument();
    expect(c.getByTestId('apercu-prix')).toHaveTextContent(/^250\s000\sF CFA \/ mois$/);
    expect(c.getByTestId('apercu-prix')).toHaveClass('text-xl', 'font-semibold', 'text-primary-deep');
    // (250 000 + 15 000) × 2 + 250 000 × 2 = 1 030 000. Lot 2 : la carte ne dit plus que la ligne de la
    // maquette ; composantes et note sont à l'encadré de l'étape du prix (StepPrix.encadre.tck-2819).
    expect(c.getByTestId('apercu-total-entree')).toHaveTextContent(/^À l’entrée : 1\s030\s000\sF CFA$/);
    expect(c.getByTestId('apercu-total-entree')).toHaveClass('text-ui', 'text-muted-foreground');
    expect(c.queryByText(/montant indicatif/i)).not.toBeInTheDocument();
  });

  it('les chiffres tant qu’il n’y a pas de prix, puis le prix et l’entrée à leur place (maquette a-2, a-3)', () => {
    const { unmount } = render(withIntl(<Harnais valeurs={{ ...STUDIO, price: undefined, area: 38 }} rendu={(f) => <CarteApercu form={f} photos={[]} compact />} />));
    expect(within(screen.getByTestId('apercu-annonce')).getByText('38 m²')).toBeInTheDocument();
    unmount();
    render(withIntl(<Harnais valeurs={{ ...STUDIO, area: 38 }} rendu={(f) => <CarteApercu form={f} photos={[]} compact />} />));
    expect(within(screen.getByTestId('apercu-annonce')).queryByText('38 m²')).not.toBeInTheDocument();
  });

  it('avant toute réponse : ni pastille ni compteur, lieu et prix à venir', () => {
    render(withIntl(<Harnais rendu={(f) => <CarteApercu form={f} photos={[]} compact />} />));
    const c = within(screen.getByTestId('apercu-annonce'));
    expect(c.queryByText(/^En (location|vente)$/)).not.toBeInTheDocument();
    expect(c.getByText('Lieu à venir')).toBeInTheDocument();
    expect(c.getByTestId('apercu-prix')).toHaveTextContent('Prix à venir');
  });
});

describe('ListePourPublier (maquette `PourPublier`)', () => {
  const ETAPES = [
    { id: 'bien', libelle: 'Le type et le contrat' },
    { id: 'lieu', libelle: 'L’emplacement' },
    { id: 'photos', libelle: 'Les photos', facultative: true },
  ];

  it('titre 15 px / 600 ; notes alignées à droite, hors du libellé ; puces des trois états', () => {
    render(withIntl(<ListePourPublier etapes={ETAPES} index={1} onRouvrir={vi.fn()} enPlus={{ libelle: 'Votre numéro', note: 'à la fin' }} />));
    expect(screen.getByText('Pour publier')).toHaveClass('text-corps', 'font-semibold');
    const courante = screen.getByText('L’emplacement');
    expect(courante).toHaveClass('flex-1', 'font-semibold');
    expect(courante.nextElementSibling).toHaveTextContent(/^en cours$/);
    expect(courante.nextElementSibling).toHaveClass('text-ui', 'text-primary');
    expect(screen.getByText('Les photos').nextElementSibling).toHaveTextContent(/^facultatif$/);
    expect(screen.getByText('Votre numéro').nextElementSibling).toHaveTextContent(/^à la fin$/);
    const fait = screen.getByRole('button', { name: 'Revenir à : Le type et le contrat' });
    expect(fait.firstElementChild).toHaveClass('bg-accent');
    expect(courante.previousElementSibling).toHaveClass('border-primary');
  });
});

describe('BarreApercu (maquette `Resume`)', () => {
  it('« Studio · En location · Mermoz », et dessous le prix « / mois »', () => {
    render(withIntl(<Harnais valeurs={STUDIO} rendu={(f) => <BarreApercu form={f} photos={[]} />} />));
    const barre = screen.getByRole('button', { name: 'Ouvrir l’aperçu de l’annonce' });
    expect(within(barre).getByText('Studio · En location · Mermoz')).toHaveClass('text-corps', 'font-semibold');
    expect(within(barre).getByText(/^250\s000\sF CFA \/ mois$/)).toHaveClass('text-ui');
  });

  it('sans prix, les chiffres déjà donnés ; le titre écrit remplace le résumé', () => {
    render(withIntl(<Harnais valeurs={{ ...STUDIO, price: undefined, area: 38, title: 'Studio meublé à Mermoz' }} rendu={(f) => <BarreApercu form={f} photos={[]} />} />));
    const barre = screen.getByRole('button', { name: 'Ouvrir l’aperçu de l’annonce' });
    expect(within(barre).getByText('Studio meublé à Mermoz')).toBeInTheDocument();
    expect(within(barre).getByText('38 m²')).toBeInTheDocument();
  });
});
