/**
 * TCK-633 (AC5) — « Louer » d'abord : le locataire est le visiteur le plus fréquent, et le
 * sélecteur de la barre publique le reléguait en second.
 *
 * L'ordre se lit sur les BOUTONS, pas sur un tableau : un test qui relirait `choix` resterait vert
 * si le rendu les inversait. La pastille se lit sur la classe que l'animation interpole (jsdom
 * n'anime rien) : au repos sous la PREMIÈRE colonne, décalée d'une colonne sous la seconde.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelecteurDeTransaction, type Transaction } from '@/components/search/SelecteurDeTransaction';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';

const LIBELLES = { groupe: 'Louer / Acheter', sale: 'Acheter', rent: 'Louer' } as const;

function monter(valeur: Transaction) {
  const onChange = vi.fn();
  render(<SelecteurDeTransaction valeur={valeur} onChange={onChange} libelles={LIBELLES} />);
  const groupe = screen.getByRole('group', { name: 'Louer / Acheter' });
  const pastille = groupe.querySelector<HTMLElement>('[data-slot="pastille"]')!;
  return { groupe, pastille, onChange };
}

/** Le libellé VISIBLE de chaque bouton, dans l'ordre du DOM (le double réservé est `aria-hidden`). */
const libellesDansLOrdre = (groupe: HTMLElement) =>
  within(groupe)
    .getAllByRole('button')
    .map((b) => b.querySelector('span:not([aria-hidden])')?.textContent);

describe('SelecteurDeTransaction — « Louer » d’abord (TCK-633)', () => {
  it('rend « Louer » avant « Acheter »', () => {
    const { groupe } = monter('');
    expect(libellesDansLOrdre(groupe)).toEqual(['Louer', 'Acheter']);
  });

  it('« Louer » choisi : la pastille reste sous la première colonne', () => {
    const { pastille } = monter('rent');
    expect(pastille.className).not.toMatch(/translate-x-full/);
    expect(pastille.className).not.toMatch(/opacity-0/);
  });

  it('« Acheter » choisi : la pastille glisse d’une colonne', () => {
    const { pastille } = monter('sale');
    expect(pastille.className).toMatch(/translate-x-full/);
  });

  it('chaque bouton émet SA transaction, le premier « rent », le second « sale »', async () => {
    const user = userEvent.setup();
    const { groupe, onChange } = monter('');
    const [premier, second] = within(groupe).getAllByRole('button');

    await user.click(premier);
    expect(onChange).toHaveBeenLastCalledWith('rent');
    await user.click(second);
    expect(onChange).toHaveBeenLastCalledWith('sale');
  });
});

/**
 * Le NOM du groupe est ce qu'un lecteur d'écran annonce avant les deux boutons : il doit les
 * nommer dans le même ordre, avec les mêmes mots, dans chaque langue. Un test qui ne lirait que
 * le français laisserait « Buy / Rent » annoncer l'ordre inverse aux anglophones.
 */
describe('nav.transactionPlaceholder — « Louer » d’abord dans chaque langue (TCK-633, AC5)', () => {
  it.each([
    ['fr', fr.nav],
    ['en', en.nav],
    ['wo', wo.nav],
  ] as const)('en %s, le nom du groupe commence par nav.rent et finit par nav.buy', (_locale, nav) => {
    const nom = nav.transactionPlaceholder;
    expect(nom.slice(0, nav.rent.length), `« ${nom} » commence par nav.rent`).toBe(nav.rent);
    expect(nom.slice(nom.length - nav.buy.length), `« ${nom} » finit par nav.buy`).toBe(nav.buy);
  });
});
