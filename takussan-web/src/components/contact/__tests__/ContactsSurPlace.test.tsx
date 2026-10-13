import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { withIntl } from '@/test/intl';
import { ContactsSurPlace, type ContactSurPlace } from '../ContactsSurPlace';

function Hote({ surChangement }: { surChangement: (v: ContactSurPlace[]) => void }) {
  const [valeur, setValeur] = useState<ContactSurPlace[]>([]);
  return (
    <ContactsSurPlace
      valeur={valeur}
      onChange={(v) => {
        setValeur(v);
        surChangement(v);
      }}
    />
  );
}

describe('<ContactsSurPlace> — TCK-633', () => {
  it('trois au plus : le bouton d’ajout disparaît au troisième', () => {
    render(withIntl(<Hote surChangement={() => {}} />));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));

    expect(screen.queryByRole('button', { name: 'Ajouter un contact' })).not.toBeInTheDocument();
    expect(screen.getByText('Trois contacts au plus.')).toBeInTheDocument();
  });

  it('un contact se titre, se numérote, se déclare WhatsApp, se retire', () => {
    const surChangement = vi.fn();
    render(withIntl(<Hote surChangement={surChangement} />));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));

    fireEvent.change(screen.getByLabelText('Qui ?'), { target: { value: 'Gardien' } });
    fireEvent.change(screen.getByLabelText('Numéro'), { target: { value: '770000803' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'WhatsApp' }));

    expect(surChangement).toHaveBeenLastCalledWith([{ label: 'Gardien', phone: '+221770000803', has_whatsapp: true }]);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le contact 1' }));
    expect(surChangement).toHaveBeenLastCalledWith([]);
  });

  /**
   * TCK-635 — retour du porteur : la grille alignait ses colonnes par le BAS (`items-end`), et
   * l'aide du champ Numéro faisait tomber « Qui ? », la case et « Retirer ». jsdom n'a pas de mise
   * en page : on garde la structure qui l'empêche — deux champs alignés en haut, et la case et le
   * retrait sur leur propre ligne, hors de la grille des champs.
   */
  it('chaque contact : les champs alignés en haut, WhatsApp et Retirer sur leur propre ligne', () => {
    render(withIntl(<Hote surChangement={() => {}} />));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));

    const champs = screen.getByLabelText('Qui ?').closest('.grid');
    expect(champs).not.toBeNull();
    expect(champs).toHaveClass('items-start');
    expect(champs).not.toHaveClass('lg:items-end');
    expect(champs).toContainElement(screen.getByLabelText('Numéro'));
    expect(champs).not.toContainElement(screen.getByRole('checkbox', { name: 'WhatsApp' }));
    expect(champs).not.toContainElement(screen.getByRole('button', { name: 'Retirer le contact 1' }));
  });
});
