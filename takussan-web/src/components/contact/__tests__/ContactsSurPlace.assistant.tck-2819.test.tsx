/**
 * TCK-2819 (lot 3) — « Contacts sur place » à l'étape de finition de l'assistant, d'après la maquette
 * `app-entree-publier` (écran a-5) : un titre de section 17 px, chaque contact dans une carte où « Qui ? »
 * et « Numéro » restent côte à côte au téléphone, « Retirer » en geste texte, « Ajouter un contact » en
 * pastille pointillée de 44 px.
 *
 * Le composant est PARTAGÉ avec la fiche du bien (`ContactsSurPlaceDuBien`), que la maquette ne couvre
 * pas : le dessin de l'assistant est une `presentation`, la fiche garde le sien.
 *
 * | test | régression attrapée |
 * |---|---|
 * | dessin de l'assistant | la variante oubliée (cadre bordé, grille repliée en une colonne au téléphone, corbeille) |
 * | fiche inchangée | la fiche du bien redessinée en même temps que l'assistant |
 * | même comportement | une variante qui n'écrit plus la même valeur |
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { withIntl } from '@/test/intl';
import { ContactsSurPlace, type ContactSurPlace } from '../ContactsSurPlace';

function Hote({ presentation, surChangement = () => {} }: { presentation?: 'assistant'; surChangement?: (v: ContactSurPlace[]) => void }) {
  const [valeur, setValeur] = useState<ContactSurPlace[]>([]);
  return (
    <ContactsSurPlace
      presentation={presentation}
      valeur={valeur}
      onChange={(v) => {
        setValeur(v);
        surChangement(v);
      }}
    />
  );
}

const ajouter = () => fireEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));

describe('<ContactsSurPlace presentation="assistant"> — maquette a-5 (TCK-2819)', () => {
  it('le titre de section en 17 px Bricolage, sans cadre autour de la section', () => {
    render(withIntl(<Hote presentation="assistant" />));
    const section = screen.getByTestId('contacts-sur-place');
    expect(section).toHaveAttribute('data-presentation', 'assistant');
    expect(section).not.toHaveClass('border', 'p-4');
    expect(screen.getByText('Contacts sur place')).toHaveClass('font-display', 'text-titre-court', 'font-semibold', 'tracking-titre');
    expect(screen.getByText(/Jusqu’à trois numéros/)).toHaveClass('text-ui');
  });

  it('« Ajouter un contact » : une pastille pointillée de 44 px', () => {
    render(withIntl(<Hote presentation="assistant" />));
    expect(screen.getByRole('button', { name: 'Ajouter un contact' })).toHaveClass('h-11', 'rounded-full', 'border-dashed');
  });

  it('chaque contact : une carte, « Qui ? » et « Numéro » côte à côte dès le téléphone, « Retirer » sans corbeille', () => {
    render(withIntl(<Hote presentation="assistant" />));
    ajouter();
    const carte = screen.getByLabelText('Qui ?').closest('[data-contact-sur-place]');
    expect(carte).toHaveClass('rounded-xl', 'bg-card');
    const champs = screen.getByLabelText('Qui ?').closest('.grid');
    expect(champs).toHaveClass('grid-cols-2', 'items-start');
    expect(champs).toContainElement(screen.getByLabelText('Numéro'));
    const retirer = screen.getByRole('button', { name: 'Retirer le contact 1' });
    expect(retirer.querySelector('svg')).toBeNull();
    expect(retirer).toHaveClass('h-11');
  });

  it('le même comportement : titré, numéroté, WhatsApp, retiré', () => {
    const surChangement = vi.fn();
    render(withIntl(<Hote presentation="assistant" surChangement={surChangement} />));
    ajouter();
    fireEvent.change(screen.getByLabelText('Qui ?'), { target: { value: 'Modou, le gardien' } });
    fireEvent.change(screen.getByLabelText('Numéro'), { target: { value: '765551234' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'WhatsApp' }));
    expect(surChangement).toHaveBeenLastCalledWith([{ label: 'Modou, le gardien', phone: '+221765551234', has_whatsapp: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le contact 1' }));
    expect(surChangement).toHaveBeenLastCalledWith([]);
  });
});

describe('<ContactsSurPlace> sans presentation — la fiche du bien garde son dessin', () => {
  it('cadre bordé, grille en une colonne au téléphone, corbeille, bouton d’ajout ordinaire', () => {
    render(withIntl(<Hote />));
    ajouter();
    const section = screen.getByTestId('contacts-sur-place');
    expect(section).not.toHaveAttribute('data-presentation');
    expect(section).toHaveClass('border', 'p-4');
    expect(screen.getByLabelText('Qui ?').closest('.grid')).toHaveClass('sm:grid-cols-2');
    expect(screen.getByLabelText('Qui ?').closest('.grid')).not.toHaveClass('grid-cols-2');
    expect(screen.getByRole('button', { name: 'Retirer le contact 1' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Ajouter un contact' })).not.toHaveClass('border-dashed');
  });
});
