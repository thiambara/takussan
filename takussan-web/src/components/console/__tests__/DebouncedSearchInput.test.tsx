import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { CONSOLE_SEARCH_DEBOUNCE_MS, DebouncedSearchInput } from '../DebouncedSearchInput';

/**
 * Le champ de recherche partagé de la console — TCK-363 (D1/D2) ET TCK-376.
 *
 * ## Deux suites, réunies à la fusion, et délibérément non fondues
 *
 * TCK-363 et TCK-376 ont écrit ce composant chacun de leur côté, sans se voir, et ont fermé LE
 * MÊME défaut de la même façon : le brouillon ne se compare jamais à la valeur qu'on a transformée
 * avant de l'envoyer. Deux implémentations convergentes ne valent pas deux fois la même garde —
 * mais leurs tests, eux, ne se recouvrent pas :
 *
 *   - ceux de TCK-363 assèrent ce que reçoit `onCommit` (l'espion), donc ce qui PART ;
 *   - ceux de TCK-376 assèrent ce qu'affiche l'hôte (`valeur-commitee`), donc ce qui EST ARRIVÉ,
 *     et couvrent en plus la fenêtre elle-même, le `blur`, l'adoption externe et le nom accessible.
 *
 * Les fondre, c'est choisir laquelle des deux paires d'yeux on garde. On garde les deux : à la
 * fusion, une garde qu'on supprime parce qu'elle « fait doublon » est une garde qu'on ne verra
 * plus refuser sa régression.
 *
 * ⚠ **Horloge RÉELLE dans les deux suites, délibérément.** `vi.useFakeTimers()` plus `userEvent`
 * fait sortir ce fichier en « Test timed out in 20000ms » sur 8 tests sur 11 (mesuré) : `user.type`
 * attend des `setTimeout` que le faux temps ne fait pas avancer tout seul. 300 ms sont de toute
 * façon au-dessous du plancher de bruit de la suite.
 */

/** Un peu plus que la fenêtre — la marge qui absorbe la contention de la machine. */
const APRES_LA_FENETRE = CONSOLE_SEARCH_DEBOUNCE_MS + 200;

const attends = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-363 — D1 / D2, et le contre-test qui les empêche d'être cochés par une régression
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
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

describe('<DebouncedSearchInput> — TCK-363, D1/D2', () => {
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
    await attends(CONSOLE_SEARCH_DEBOUNCE_MS * 2);
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

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-376 — les mêmes deux défauts vus depuis l'hôte, plus la propriété qui justifie le composant
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

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

describe('<DebouncedSearchInput> — TCK-376', () => {
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
