import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Délai propre des utilités asynchrones de Testing Library — `waitFor` et tous les `findBy*`.
// VALEUR MESURÉE (TCK-313), et le second des deux plafonds de cette suite : `testTimeout`
// (20 s, TCK-312) borne le TEST, celui-ci borne CHAQUE ATTENTE à l'intérieur.
//
// Les 1000 ms précédents n'avaient jamais été choisis : c'était le défaut de Testing Library.
//
// ── La mesure, 2026-08-17, machine à 8 cœurs (`sysctl -n hw.ncpu`) ────────────────────────────
// Chaque `waitFor`/`findBy*` de la suite a été chronométré en enveloppant `getConfig()
// .asyncWrapper`, en séparant par la pile les attentes des frappes `user-event` (qui, elles, ne
// sont PAS gouvernées par ce délai).
//
//   suite entière, 888 tests, charge 1-min 4,1 → 37,9 : 227 attentes
//       p50 = 8,4 ms · p90 = 86 ms · p95 = 150 ms · p99 = 364 ms · MAX = 467 ms
//       5 attentes seulement au-dessus de 200 ms. La distribution est donc très creuse — mais
//       c'est justement pourquoi la QUEUE décide, et elle était à 47 % du plafond.
//
// Le chiffre qui tranche n'est pas celui-là, c'est sa VOLATILITÉ. La même attente
// (`Integrations > renders masked credentials…`, `findByPlaceholderText('••••1234')`) a été
// mesurée à **467 ms** puis, quelques minutes plus tard sur le même code, à **980 ms** — 98 % du
// plafond — pour la seule raison que d'autres agents travaillaient sur la machine. La marge
// annoncée par 1000 ms n'était pas de 2,1× : elle valait ce que la machine faisait d'autre.
//
//   sous-ensemble des 9 fichiers aux attentes les plus longues, 38 tests :
//       charge 20,8 → 24,0     pire attente   980 ms    38/38
//       charge 72 → 128        pire attente  1653 ms    38/38
//       charge 287 → 331       pire attente  4853 ms    ✗ 1 ROUGE, deux tours sur deux
//
// ── Ablation, dans les deux sens ──────────────────────────────────────────────────────────────
//   · à 1000 ms, sous 192 brûleurs CPU (charge 287 → 331), `Integrations` rougit 2 tours sur 2
//     avec exactement le message du ticket : « Unable to find an element with the placeholder
//     text of: ••••1234 » — un message qui accuse le composant, lequel n'y est pour rien.
//   · à 3000 ms, MÊME charge (255 → 331), 38/38 deux tours sur deux. 5000 ms tient aussi
//     (charge 298 → 417), et n'apporte rien de plus.
//
// ── Le coût, chiffré, parce qu'il est réel ────────────────────────────────────────────────────
// Ce délai-ci est ce qui fait échouer VITE une vraie régression : une attente qui ne sera jamais
// satisfaite brûle son plafond en entier. Mesuré en muselant un mock (`api_key` rendu différent
// de ce que le test cherche) : exactement UNE attente échoue par test rouge, et elle consomme le
// plafond à la milliseconde près.
//
//       délai      attente échouée      fichier complet
//       1000 ms         1004 ms             2,85 s
//       3000 ms         3002 ms             4,61 s      ← retenu
//       5000 ms         5003 ms             6,21 s
//
// D'où 3000 et non 5000 : 3000 couvre toute la plage de charge mesurée, y compris celle qui
// rougissait, et ne facture que **+2 s par test rouge** au lieu de +4 s. Sur une exécution verte,
// le coût est exactement nul — un plafond ne se paie que lorsqu'on l'atteint.
//
// ⚠ Ne pas relever ce délai sans refaire cette mesure, et ne pas le lire comme une licence à
// écrire des attentes lentes : au repos, 95 % des attentes de la suite tiennent en 150 ms.
configure({ asyncUtilTimeout: 3000 });

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverMock;

// jsdom does not implement matchMedia — components that subscribe to a media
// query (FloatingDock viewport gates, etc.) need a noop polyfill so they don't
// crash during render. Tests that care about the result can override the mock.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
