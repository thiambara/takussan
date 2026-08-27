import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { withIntl } from '@/test/intl';
import { DebouncedSearchInput, CONSOLE_SEARCH_DEBOUNCE_MS } from '../DebouncedSearchInput';

/**
 * TCK-376 — les quatre défauts que la revue adverse de TCK-363 a trouvés dans ce champ, plus la
 * propriété qu'il existe pour tenir.
 *
 * Les deux premiers sont des défauts de FRAPPE, pas d'affichage : ils se voient en tapant, et
 * aucun test de rendu ne les aurait vus. C'est pourquoi ceux-ci tapent vraiment, caractère par
 * caractère, dans un hôte qui recopie la valeur commitée dans la prop — c'est-à-dire dans la
 * boucle exacte des écrans réels, où le commit revient par l'URL.
 *
 * ⚠ **Horloge RÉELLE, délibérément.** `vi.useFakeTimers()` plus `userEvent` fait sortir ce
 * fichier en « Test timed out in 20000ms » sur 8 tests sur 11 (mesuré) : `user.type` attend des
 * `setTimeout` que le faux temps ne fait pas avancer tout seul. 300 ms sont de toute façon
 * au-dessous du plancher de bruit de la suite.
 */

/** Un peu plus que la fenêtre — la marge qui absorbe la contention de la machine. */
const APRES_LA_FENETRE = CONSOLE_SEARCH_DEBOUNCE_MS + 200;

const attends = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Un hôte qui se comporte comme un écran : ce qui est commité redescend en `value`.
 *
 * Sans cette boucle, aucun des deux défauts ne se reproduit — un test qui monterait le composant
 * avec une `value` figée serait vert sur le code cassé.
 */
function Hote({
  onCommit,
  valeurInitiale = '',
}: {
  readonly onCommit?: (v: string) => void;
  readonly valeurInitiale?: string;
}) {
  const [value, setValue] = useState(valeurInitiale);
  return (
    <>
      <DebouncedSearchInput
        value={value}
        onCommit={(next) => {
          setValue(next);
          onCommit?.(next);
        }}
        placeholder="Rechercher…"
        aria-label="Rechercher"
      />
      <output data-testid="valeur-commitee">{value}</output>
    </>
  );
}

function champ() {
  return screen.getByRole('searchbox');
}

describe('<DebouncedSearchInput>', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  // ─── La propriété qui justifie le composant (AC3 du ticket) ─────────────────────────────────
  it('dix caractères saisis ne commitent qu’une fois', async () => {
    const onCommit = vi.fn();
    render(withIntl(<Hote onCommit={onCommit} />));

    await user.type(champ(), 'Ziguinchor'); // 10 caractères
    expect(onCommit).not.toHaveBeenCalled(); // rien n'est encore parti

    await waitFor(() => expect(onCommit).toHaveBeenCalled());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Ziguinchor');
  });

  // ─── Défaut (a) de la revue TCK-363 : le champ avalait les espaces ──────────────────────────
  //
  // `useStateSyncedWith(value)` + `commit.call(value.trim())` : le brouillon gardait « Dakar␣ »,
  // le commit envoyait « Dakar », la resynchronisation réécrivait le brouillon à « Dakar », et
  // la frappe suivante donnait « DakarImmo ». Le test tape en DEUX temps, la fenêtre échéant au
  // milieu — c'est le seul moment où le défaut se produit.
  it('garde l’espace qu’on vient de taper quand le commit revient (défaut a)', async () => {
    render(withIntl(<Hote />));

    await user.type(champ(), 'Dakar ');
    await waitFor(() =>
      expect(screen.getByTestId('valeur-commitee')).toHaveTextContent('Dakar'),
    );

    // Ce que voit l'utilisateur ne doit PAS avoir bougé sous son curseur.
    expect(champ()).toHaveValue('Dakar ');

    await user.type(champ(), 'Immo');
    expect(champ()).toHaveValue('Dakar Immo');

    await waitFor(() =>
      expect(screen.getByTestId('valeur-commitee')).toHaveTextContent('Dakar Immo'),
    );
  });

  it('garde les espaces intérieurs sur une frappe entrecoupée', async () => {
    const onCommit = vi.fn();
    render(withIntl(<Hote onCommit={onCommit} />));

    // Trois mots, une fenêtre qui échoit entre chacun : trois occasions d'avaler un espace.
    await user.type(champ(), 'Résidence ');
    await attends(APRES_LA_FENETRE);
    await user.type(champ(), 'les ');
    await attends(APRES_LA_FENETRE);
    await user.type(champ(), 'Baobabs');
    await attends(APRES_LA_FENETRE);

    expect(champ()).toHaveValue('Résidence les Baobabs');
    expect(onCommit).toHaveBeenLastCalledWith('Résidence les Baobabs');
  });

  // ─── Défaut (b) de la revue TCK-363 : l’indicateur ne s’éteignait jamais ────────────────────
  it('éteint l’indicateur d’attente sur une saisie d’espaces seuls (défaut b)', async () => {
    render(withIntl(<Hote />));

    await user.type(champ(), '   ');
    await attends(APRES_LA_FENETRE);

    // Rien ne part et rien n'attend : il n'y a rien à chercher dans trois espaces.
    expect(screen.queryByTestId('console-search-pending')).not.toBeInTheDocument();
  });

  it('éteint l’indicateur une fois la valeur repliée arrivée, malgré l’espace final', async () => {
    render(withIntl(<Hote />));

    await user.type(champ(), 'Dakar ');
    await waitFor(() =>
      expect(screen.queryByTestId('console-search-pending')).not.toBeInTheDocument(),
    );
  });

  it('allume l’indicateur PENDANT la fenêtre, alors qu’aucune requête n’est en vol', async () => {
    const onCommit = vi.fn();
    render(withIntl(<Hote onCommit={onCommit} />));

    await user.type(champ(), 'Saly');

    // Les deux assertions vont ENSEMBLE : la pastille seule serait verte avec un délai de 0 ms.
    expect(screen.getByTestId('console-search-pending')).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('allume l’indicateur tant qu’une requête dérivée est en vol (busy)', () => {
    render(withIntl(
      <DebouncedSearchInput
        value="Saly"
        onCommit={vi.fn()}
        placeholder="Rechercher…"
        aria-label="Rechercher"
        busy
      />,
    ));
    expect(screen.getByTestId('console-search-pending')).toBeInTheDocument();
  });

  // ─── L’adoption d’une valeur venue d’AILLEURS reste possible ────────────────────────────────
  //
  // C'est la contrepartie du correctif (a) : à force de ne plus resynchroniser, on pourrait ne
  // plus resynchroniser du tout — et « réinitialiser » ou un retour arrière laisseraient le
  // champ afficher une recherche qui n'est plus posée.
  it('adopte une valeur changée de l’extérieur (réinitialisation, retour arrière)', () => {
    const { rerender } = render(withIntl(
      <DebouncedSearchInput
        value="Dakar"
        onCommit={vi.fn()}
        placeholder="Rechercher…"
        aria-label="Rechercher"
      />,
    ));
    expect(champ()).toHaveValue('Dakar');

    rerender(withIntl(
      <DebouncedSearchInput
        value=""
        onCommit={vi.fn()}
        placeholder="Rechercher…"
        aria-label="Rechercher"
      />,
    ));
    expect(champ()).toHaveValue('');
  });

  it('adopte une valeur extérieure même quand un brouillon est en cours', async () => {
    const { rerender } = render(withIntl(
      <DebouncedSearchInput
        value=""
        onCommit={vi.fn()}
        placeholder="Rechercher…"
        aria-label="Rechercher"
      />,
    ));
    await user.type(champ(), 'Dak');

    rerender(withIntl(
      <DebouncedSearchInput
        value="Thiès"
        onCommit={vi.fn()}
        placeholder="Rechercher…"
        aria-label="Rechercher"
      />,
    ));
    expect(champ()).toHaveValue('Thiès');
  });

  it('commite MAINTENANT ce qui attendait quand le champ perd le focus', async () => {
    const onCommit = vi.fn();
    render(withIntl(
      <>
        <DebouncedSearchInput
          value=""
          onCommit={onCommit}
          placeholder="Rechercher…"
          aria-label="Rechercher"
        />
        <button type="button">Ailleurs</button>
      </>,
    ));

    await user.type(champ(), 'Mbour');
    expect(onCommit).not.toHaveBeenCalled();

    await user.tab();
    expect(onCommit).toHaveBeenCalledWith('Mbour');
  });

  it('porte son nom accessible et son texte indicatif', () => {
    render(withIntl(
      <DebouncedSearchInput
        value=""
        onCommit={vi.fn()}
        placeholder="Rechercher un bien…"
        aria-label="Rechercher un bien à modérer"
      />,
    ));
    expect(screen.getByRole('searchbox', { name: 'Rechercher un bien à modérer' }))
      .toHaveAttribute('placeholder', 'Rechercher un bien…');
  });
});
