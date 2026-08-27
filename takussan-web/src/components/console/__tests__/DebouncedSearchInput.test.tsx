import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { CONSOLE_SEARCH_DEBOUNCE_MS, DebouncedSearchInput } from '../DebouncedSearchInput';

/**
 * TCK-363, D1/D2 — le champ de recherche partagé des trois écrans de la console.
 *
 * ## Pourquoi un harnais et pas une prop `value` figée
 *
 * Le défaut ne se voit QUE dans la boucle complète : le champ commite une valeur TRIMÉE, l'écran
 * la range (URL ou état de page), et la renvoie en prop. C'est ce retour qui écrasait le
 * brouillon. Un test qui monterait le composant avec un `value` constant ne parcourrait jamais
 * le chemin fautif — et resterait vert avec le défaut en place.
 */
function Harnais({ onCommit }: { onCommit?: (next: string) => void }) {
  // L'état COMMITÉ, exactement comme `?search=` sur `/users` ou `useState` sur `/agencies`.
  const [value, setValue] = useState('');
  return (
    <DebouncedSearchInput
      value={value}
      onCommit={(next) => {
        setValue(next);
        onCommit?.(next);
      }}
      placeholder="Rechercher"
      aria-label="Rechercher"
    />
  );
}

function renderChamp() {
  const onCommit = vi.fn();
  render(withIntl(<Harnais onCommit={onCommit} />));
  return { onCommit, champ: screen.getByLabelText('Rechercher') as HTMLInputElement };
}

describe('<DebouncedSearchInput>', () => {
  /**
   * Le test qui distingue le correctif du défaut : une recherche à DEUX MOTS.
   *
   * Les trois tests AC3 du lot tapent un seul mot (« Ziguinchor », « appartemen ») et sont donc
   * verts des deux côtés. Ici, l'espace est commité comme rien du tout (`' Dakar '.trim()`), la
   * valeur revient sans lui, et une resynchronisation naïve du brouillon le RETIRE du champ sous
   * les doigts de l'utilisateur : « Dakar » + « Immo » se saisissait « DakarImmo ».
   *
   * Le catalogue de la console porte des noms à deux mots — « Dakar Immo », « Ziguinchor
   * Habitat » — donc ce chemin est le cas NOMINAL, pas un cas limite.
   */
  it("n'avale pas l'espace d'une recherche à deux mots — D1", async () => {
    const user = userEvent.setup();
    const { onCommit, champ } = renderChamp();

    await user.type(champ, 'Dakar ');
    // On ATTEND que le commit du premier mot revienne : c'est ce retour qui écrasait le
    // brouillon. Sans cette attente, le test resterait vert avec le défaut.
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('Dakar'));

    expect(champ).toHaveValue('Dakar ');

    await user.type(champ, 'Immo');
    expect(champ).toHaveValue('Dakar Immo');

    await waitFor(() => expect(onCommit).toHaveBeenLastCalledWith('Dakar Immo'));
  });

  /**
   * D2 — même cause racine, autre symptôme. `enAttente` comparait le brouillon BRUT à la valeur
   * TRIMÉE : une saisie faite d'espaces seuls ne les faisait jamais converger, et la pastille
   * `role="status"` (« Recherche en cours… ») restait affichée indéfiniment pour une requête qui
   * ne partirait jamais.
   */
  it("éteint l'indicateur d'attente sur une saisie faite d'espaces seuls — D2", async () => {
    const user = userEvent.setup();
    const { onCommit, champ } = renderChamp();

    await user.type(champ, '  ');
    expect(champ).toHaveValue('  ');

    // Deux fenêtres de temporisation : si la pastille est encore là, elle ment.
    await new Promise((resolve) => setTimeout(resolve, CONSOLE_SEARCH_DEBOUNCE_MS * 2));
    expect(screen.queryByTestId('console-search-pending')).not.toBeInTheDocument();
    // Et rien n'est parti au serveur : `'  '.trim()` ne vaut aucune recherche.
    expect(onCommit).not.toHaveBeenCalledWith('  ');
  });

  /** Le contre-test : « réinitialiser » (valeur externe remise à zéro) doit VIDER le champ. */
  it('un changement réel de la valeur externe remplace bien le brouillon', async () => {
    const user = userEvent.setup();
    function HarnaisAvecReset() {
      const [value, setValue] = useState('');
      return (
        <>
          <DebouncedSearchInput
            value={value}
            onCommit={setValue}
            placeholder="Rechercher"
            aria-label="Rechercher"
          />
          <button type="button" onClick={() => setValue('')}>
            Réinitialiser
          </button>
        </>
      );
    }
    render(withIntl(<HarnaisAvecReset />));

    const champ = screen.getByLabelText('Rechercher');
    await user.type(champ, 'Dakar');
    await waitFor(() => expect(champ).toHaveValue('Dakar'));

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => expect(champ).toHaveValue(''));
  });
});
