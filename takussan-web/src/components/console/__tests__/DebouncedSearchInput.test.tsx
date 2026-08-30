import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { CONSOLE_SEARCH_DEBOUNCE_MS, DebouncedSearchInput } from '../DebouncedSearchInput';

/**
 * Le champ de recherche partagé de la console — TCK-363 (D1/D2), TCK-376, et TCK-451.
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
 * ⚠ **Horloge RÉELLE, délibérément.** `vi.useFakeTimers()` plus `userEvent` fait sortir ce fichier
 * en « Test timed out in 20000ms » sur 8 tests sur 11 (mesuré) : `user.type` attend des
 * `setTimeout` que le faux temps ne fait pas avancer tout seul.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ## TCK-451 — pourquoi ce fichier ne PARIE plus sur l'ordonnancement
 *
 * Le 2026-08-27, trois tests de ce fichier ont rougi sous `load average 240` sur 8 cœurs, verts
 * au repos, sur une branche mécaniquement hors de cause. **Deux mécanismes distincts**, et non
 * un seul comme le compte le laissait croire :
 *
 * **Mécanisme 1 — le pari sur l'intervalle inter-frappe.** `useDebouncedCallback.call` RÉ-ARME la
 * fenêtre à chaque caractère. Ce qui doit rester sous les 300 ms n'est donc pas la durée totale
 * de la frappe (mesuré : une frappe de 896 ms espacée de 60 ms ne commite PAS) mais l'**intervalle
 * entre deux frappes consécutives** — un seul intervalle au-dessus de 300 ms, où qu'il tombe,
 * suffit à faire commiter pendant la frappe et à retourner toute assertion négative.
 *
 * > Intervalle inter-frappe mesuré le **2026-08-29**, 8 cœurs (`sysctl -n hw.ncpu`), `load
 * > average` 3,2, sonde posée sur `keydown`, six essais de dix caractères : **max 2,9 à 4,6 ms**,
 * > soit une marge de 65× à 103× sur la fenêtre de 300 ms. C'est une grandeur de QUEUE : la marge
 * > au repos ne dit rien du pire cas sous contention, et TCK-312 a mesuré des facteurs de 11,6×
 * > à 16,7× sur les tests d'interaction.
 *
 * **Correction** : là où le test affirme que RIEN n'est encore parti, il injecte
 * {@link FENETRE_PLUS_LONGUE_QUE_LE_TEST} et fait échoir la fenêtre lui-même, par `blur`. La
 * grandeur défendue devient : *la fenêtre (60 000 ms) est plus longue que le plafond du test
 * (`testTimeout` = 20 000 ms, TCK-312)*. Aucun décrochage d'ordonnancement ne peut donc la faire
 * échoir pendant la frappe — si la machine décroche assez pour que ce soit une question, c'est le
 * plafond du test qui parle, et il dit la vérité (la machine), pas le faux « l'anti-rebond a
 * disparu ».
 *
 * **Mécanisme 2 — le budget de `waitFor`.** Deux des trois rouges portaient une assertion
 * POSITIVE : un `waitFor` qui attend un commit produit par un `setTimeout` de 300 ms, sur un
 * budget de 3000 ms (`asyncUtilTimeout`, `vitest.setup.ts`, TCK-313).
 *
 * > Budget réellement consommé par cette attente, mesuré le **2026-08-29** dans les mêmes
 * > conditions, six essais : **300,6 à 307,3 ms sur 3000**, soit une marge de **9,8× à 10,0×** —
 * > au-dessous des facteurs de contention 11,6-16,7× de TCK-312. La revue adverse en a chronométré
 * > un à **4032 ms** sous contention, c'est-à-dire un facteur 13,4 sur cette même attente.
 *
 * **Correction** : ces attentes disparaissent — le `blur` rend le commit synchrone. Il en reste
 * **une seule**, celle qui prouve que la fenêtre échoit TOUTE SEULE (sans quoi un composant qui ne
 * commiterait qu'au `blur` passerait tout ce fichier), et elle porte une borne LOCALE explicite :
 * {@link BUDGET_DE_LA_SEULE_ATTENTE_REELLE}.
 *
 * **Ce que la correction ne fait pas** : ni `CONSOLE_SEARCH_DEBOUNCE_MS`, ni `asyncUtilTimeout`,
 * ni `testTimeout` ne bougent — les relever déplacerait les seuils sans retirer la course. Et
 * aucune assertion n'a été retirée : c'est le point que l'ablation ci-dessous vérifie.
 *
 * ⚠ **Vérifié par ABLATION le 2026-08-29** (AC1) : `commit.call(…)` remplacé par un appel direct
 * à `onCommit(…)` dans `DebouncedSearchInput.tsx` — donc plus d'anti-rebond du tout — fait rougir
 * **4 tests sur 15** de ce fichier, dont les trois qui gardent la temporisation elle-même. Un
 * correctif de fiabilité qui rendrait ces tests insensibles à la régression qu'ils gardent serait
 * pire que le défaut.
 *
 * ⚠⚠ **Et les deux DÉFAUTS démontés ENSEMBLE, dans cet ordre : corpus puis branche de garde.**
 * C'est la combinaison que l'ablation une-par-une ne sonde jamais, et elle a trouvé un trou chez
 * deux autres gardes du même lot. Mesuré :
 *
 * ```
 *   anti-rebond retiré seul ................................... 4 rouges
 *   resynchronisation rendue inconditionnelle seule ........... 3 rouges  (dont « défaut a »)
 *   LES DEUX ................................................. 4 rouges  ← les MÊMES 4
 * ```
 *
 * **Aucune combinaison ne rend le fichier vert** — c'est ce qui compte, et c'est vérifié. Mais le
 * recouvrement n'est pas neutre : *retirer l'anti-rebond MASQUE le défaut de resynchronisation
 * dans la liste des rouges.* Les deux tests qui le nomment (« garde l'espace… », « garde les
 * espaces intérieurs ») cessent de mordre dès que la fenêtre disparaît, parce qu'ils ont besoin
 * qu'un commit revienne PENDANT la frappe pour éprouver la comparaison.
 *
 * Conséquence pratique, et la seule à retenir : **un rouge de ce fichier ne se lit pas en une
 * passe.** Réparer l'anti-rebond peut faire APPARAÎTRE trois rouges de plus au lieu d'en retirer.
 * Ce n'est pas une régression du correctif — c'est l'ordre dans lequel deux défauts superposés se
 * découvrent.
 */

/**
 * La fenêtre injectée dès qu'un test doit affirmer que **rien n'est encore parti**.
 *
 * 60 000 ms, contre 20 000 ms de `testTimeout` : la fenêtre ne peut pas échoir avant que le test
 * lui-même ne meure. L'assertion négative ne dépend donc plus d'aucun ordonnancement — c'est le
 * seul réglage de ce fichier qui soit une PREUVE et non une marge (TCK-451, mécanisme 1).
 */
const FENETRE_PLUS_LONGUE_QUE_LE_TEST = 60_000;

/**
 * La borne locale de la SEULE attente qui reste sur l'horloge réelle (TCK-451, mécanisme 2).
 *
 * 10 000 ms pour une attente qui coûte 300,6-307,3 ms au repos (mesuré le 2026-08-29) : marge de
 * **33×**, et **2,5×** sur le pire cas jamais observé sous contention (4032 ms). Elle reste
 * au-dessous de `testTimeout` (20 s) pour que l'échec soit lisible — un message d'assertion,
 * jamais un « Test timed out » qui n'apprend rien.
 */
const BUDGET_DE_LA_SEULE_ATTENTE_REELLE = 10_000;

/**
 * Fait échoir la fenêtre **maintenant**, par le seul moyen qu'a l'utilisateur : quitter le champ.
 *
 * `onBlur={() => commit.flush()}` — c'est le chemin de production, pas une trappe de test. Ce que
 * le composant voit est exactement ce qu'il verrait d'une fenêtre échue : `onCommit` reçoit la
 * valeur trimée, l'écran la range, elle redescend en `value`.
 */
const faitEchoirLaFenetre = (user: ReturnType<typeof userEvent.setup>) => user.tab();

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
 *
 * Le bouton « Ailleurs » n'est pas décoratif : il donne au `blur` une destination, donc au test
 * un moyen de choisir l'instant où la fenêtre échoit (TCK-451).
 */
function Harnais({
  onCommit,
  debounceMs,
}: {
  readonly onCommit?: (next: string) => void;
  readonly debounceMs: number;
}) {
  // L'état COMMITÉ, exactement comme `?search=` sur `/users` ou `useState` sur `/agencies`.
  const [value, setValue] = useState('');
  return (
    <>
      <DebouncedSearchInput
        value={value}
        debounceMs={debounceMs}
        onCommit={(next) => {
          setValue(next);
          onCommit?.(next);
        }}
        placeholder="Rechercher"
        aria-label="Rechercher"
      />
      <button type="button">Ailleurs</button>
    </>
  );
}

function renderChamp(debounceMs: number) {
  const onCommit = vi.fn();
  render(withIntl(<Harnais onCommit={onCommit} debounceMs={debounceMs} />));
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
   *
   * ⚠ Le défaut ne se produit qu'à UN instant : celui où le commit du premier mot revient alors
   * que le brouillon porte déjà son espace. Ce test CHOISIT cet instant (`blur`) au lieu de
   * l'espérer d'une fenêtre de 300 ms qui échoirait « quelque part » entre les deux frappes
   * (TCK-451).
   */
  it("n'avale pas l'espace d'une recherche à deux mots — D1", async () => {
    const user = userEvent.setup();
    const { onCommit, champ } = renderChamp(FENETRE_PLUS_LONGUE_QUE_LE_TEST);

    await user.type(champ, 'Dakar ');
    expect(onCommit).not.toHaveBeenCalled();

    // Le commit du premier mot revient MAINTENANT : c'est ce retour qui écrasait le brouillon.
    await faitEchoirLaFenetre(user);
    expect(onCommit).toHaveBeenCalledWith('Dakar');

    expect(champ).toHaveValue('Dakar ');

    await user.type(champ, 'Immo');
    expect(champ).toHaveValue('Dakar Immo');

    await faitEchoirLaFenetre(user);
    expect(onCommit).toHaveBeenLastCalledWith('Dakar Immo');
  });

  /**
   * D2 — même cause racine, autre symptôme. `enAttente` comparait le brouillon BRUT à la valeur
   * TRIMÉE : une saisie faite d'espaces seuls ne les faisait jamais converger, et la pastille
   * `role="status"` (« Recherche en cours… ») restait affichée indéfiniment pour une requête qui
   * ne partirait jamais.
   *
   * ⚠ L'assertion est prise IMMÉDIATEMENT, sans attendre deux fenêtres (TCK-451) : avec le défaut,
   * `'  '.trim() !== ''` est vrai dès le premier rendu, donc la pastille est là dès le premier
   * rendu. Attendre 600 ms ne rendait pas le test plus sévère — seulement plus lent, et exposé à
   * une fenêtre qui échoit au mauvais moment.
   */
  it("éteint l'indicateur d'attente sur une saisie faite d'espaces seuls — D2", async () => {
    const user = userEvent.setup();
    const { onCommit, champ } = renderChamp(FENETRE_PLUS_LONGUE_QUE_LE_TEST);

    await user.type(champ, '  ');
    expect(champ).toHaveValue('  ');

    expect(screen.queryByTestId('console-search-pending')).not.toBeInTheDocument();
    // Et rien ne partira au serveur : `'  '.trim()` ne vaut aucune recherche.
    await faitEchoirLaFenetre(user);
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
            debounceMs={FENETRE_PLUS_LONGUE_QUE_LE_TEST}
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
    // La valeur externe doit VALOIR « Dakar » avant qu'on la remette à zéro, sinon
    // « réinitialiser » ne change rien et le contre-test ne teste rien.
    await faitEchoirLaFenetre(user);
    expect(champ).toHaveValue('Dakar');

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(champ).toHaveValue('');
  });

  /**
   * La garde que tout le reste du fichier ne porte plus (TCK-451).
   *
   * Les autres tests font échoir la fenêtre par `blur` — ils prouvent la COALESCENCE, pas
   * l'ÉCHÉANCE. Sans ce test-ci, un composant qui ne commiterait jamais qu'au `blur` les
   * passerait tous, et la recherche ne partirait plus jamais toute seule.
   *
   * C'est le seul test du fichier qui paie l'horloge réelle, et donc le seul qui porte une borne
   * d'attente. Il n'a aucune assertion négative : rien à retourner si la fenêtre échoit tôt.
   */
  it('la fenêtre échoit TOUTE SEULE : un commit part sans blur ni flush', async () => {
    const user = userEvent.setup();
    const { onCommit, champ } = renderChamp(CONSOLE_SEARCH_DEBOUNCE_MS);

    await user.type(champ, 'Dakar');

    await waitFor(() => expect(onCommit).toHaveBeenCalled(), {
      timeout: BUDGET_DE_LA_SEULE_ATTENTE_REELLE,
    });
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
  debounceMs = FENETRE_PLUS_LONGUE_QUE_LE_TEST,
}: {
  readonly onCommit?: (v: string) => void;
  readonly valeurInitiale?: string;
  readonly debounceMs?: number;
}) {
  const [value, setValue] = useState(valeurInitiale);
  return (
    <>
      <DebouncedSearchInput
        value={value}
        debounceMs={debounceMs}
        onCommit={(next) => {
          setValue(next);
          onCommit?.(next);
        }}
        placeholder="Rechercher…"
        aria-label="Rechercher"
      />
      <output data-testid="valeur-commitee">{value}</output>
      <button type="button">Ailleurs</button>
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
  //
  // L'assertion négative est ici la garde principale du composant : c'est elle qui distingue
  // « anti-rebond » de « pas d'anti-rebond du tout ». Elle ne peut plus être retournée par un
  // décrochage d'ordonnancement — la fenêtre injectée survit au plafond du test (TCK-451).
  it('dix caractères saisis ne commitent qu’une fois', async () => {
    const onCommit = vi.fn();
    render(withIntl(<Hote onCommit={onCommit} />));

    await user.type(champ(), 'Ziguinchor'); // 10 caractères
    expect(onCommit).not.toHaveBeenCalled(); // rien n'est encore parti

    await faitEchoirLaFenetre(user);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Ziguinchor');
  });

  // ─── Défaut (a) de la revue TCK-363 : le champ avalait les espaces ──────────────────────────
  //
  // `useStateSyncedWith(value)` + `commit.call(value.trim())` : le brouillon gardait « Dakar␣ »,
  // le commit envoyait « Dakar », la resynchronisation réécrivait le brouillon à « Dakar », et
  // la frappe suivante donnait « DakarImmo ». Le test tape en DEUX temps, la fenêtre échéant au
  // milieu — c'est le seul moment où le défaut se produit, et le test le choisit (TCK-451).
  it('garde l’espace qu’on vient de taper quand le commit revient (défaut a)', async () => {
    render(withIntl(<Hote />));

    await user.type(champ(), 'Dakar ');
    await faitEchoirLaFenetre(user);
    expect(screen.getByTestId('valeur-commitee')).toHaveTextContent('Dakar');

    // Ce que voit l'utilisateur ne doit PAS avoir bougé sous son curseur.
    expect(champ()).toHaveValue('Dakar ');

    await user.type(champ(), 'Immo');
    expect(champ()).toHaveValue('Dakar Immo');

    await faitEchoirLaFenetre(user);
    expect(screen.getByTestId('valeur-commitee')).toHaveTextContent('Dakar Immo');
  });

  it('garde les espaces intérieurs sur une frappe entrecoupée', async () => {
    const onCommit = vi.fn();
    render(withIntl(<Hote onCommit={onCommit} />));

    // Trois mots, une fenêtre qui échoit entre chacun : trois occasions d'avaler un espace.
    await user.type(champ(), 'Résidence ');
    await faitEchoirLaFenetre(user);
    await user.type(champ(), 'les ');
    await faitEchoirLaFenetre(user);
    await user.type(champ(), 'Baobabs');
    await faitEchoirLaFenetre(user);

    expect(champ()).toHaveValue('Résidence les Baobabs');
    expect(onCommit).toHaveBeenLastCalledWith('Résidence les Baobabs');
  });

  // ─── Défaut (b) de la revue TCK-363 : l’indicateur ne s’éteignait jamais ────────────────────
  it('éteint l’indicateur d’attente sur une saisie d’espaces seuls (défaut b)', async () => {
    render(withIntl(<Hote />));

    await user.type(champ(), '   ');

    // Rien ne part et rien n'attend : il n'y a rien à chercher dans trois espaces.
    expect(screen.queryByTestId('console-search-pending')).not.toBeInTheDocument();
  });

  it('éteint l’indicateur une fois la valeur repliée arrivée, malgré l’espace final', async () => {
    render(withIntl(<Hote />));

    await user.type(champ(), 'Dakar ');
    await faitEchoirLaFenetre(user);

    expect(screen.queryByTestId('console-search-pending')).not.toBeInTheDocument();
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
        debounceMs={FENETRE_PLUS_LONGUE_QUE_LE_TEST}
        onCommit={vi.fn()}
        placeholder="Rechercher…"
        aria-label="Rechercher"
      />,
    ));
    await user.type(champ(), 'Dak');

    rerender(withIntl(
      <DebouncedSearchInput
        value="Thiès"
        debounceMs={FENETRE_PLUS_LONGUE_QUE_LE_TEST}
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
          debounceMs={FENETRE_PLUS_LONGUE_QUE_LE_TEST}
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
