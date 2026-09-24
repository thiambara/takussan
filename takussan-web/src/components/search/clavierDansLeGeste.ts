/**
 * TCK-563 (M3, décision du porteur du 2026-09-24) — un appui sur la pastille de recherche mobile
 * ouvre la saisie CLAVIER PRÊT, du premier coup, y compris sur iPhone.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE MÉCANISME QUI DEMANDAIT UN SECOND APPUI
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La saisie est une feuille base-ui (`Sheet`) dont le champ reçoit le focus par `initialFocus`.
 * Or base-ui ne le pose PAS dans le geste : `FloatingFocusManager` le diffère d'une micro-tâche,
 * puis `enqueueFocus` d'une image (`requestAnimationFrame`) — `floating-ui-react/components/
 * FloatingFocusManager.js` (effet « Focus the initial element », `queueMicrotask` puis
 * `enqueueFocus`) et `floating-ui-react/utils/enqueueFocus.js`. Safari iOS n'ouvre le clavier
 * que pour un `focus()` exécuté PENDANT le traitement du geste : hors de lui, le champ a le focus
 * (le curseur clignote) mais le clavier reste fermé, et il faut toucher le champ une seconde fois.
 * Mesuré au navigateur (Chrome, émulation tactile, 320 et 390 px) : à la fin du gestionnaire de
 * `click`, le focus est encore sur la PASTILLE ; il n'arrive au champ qu'une image plus tard.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE CORRECTIF : UN RELAIS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Dans le gestionnaire du geste, on focalise un champ texte invisible déjà dans le document : le
 * clavier s'ouvre. Quand base-ui passe le focus au vrai champ, iOS GARDE le clavier (le focus va
 * d'un champ texte à un autre) et le relais disparaît à sa perte de focus. Le relais est :
 * - en 16 px — sous cette taille, Safari zoome la page au focus ;
 * - `fixed` en haut à gauche, focalisé avec `preventScroll` — rien ne défile ;
 * - hors de l'ordre de tabulation et de l'arbre d'accessibilité ;
 * - retiré au plus tard après {@link DELAI_DE_GARDE_MS} si rien ne reprend le focus (feuille qui
 *   ne s'ouvre pas) : un clavier ne reste jamais ouvert sur un champ invisible.
 */
export const DELAI_DE_GARDE_MS = 1000;

export function ouvrirLeClavierDansLeGeste(): void {
  if (typeof document === 'undefined') return;
  const relais = document.createElement('input');
  relais.type = 'text';
  relais.tabIndex = -1;
  relais.setAttribute('aria-hidden', 'true');
  relais.setAttribute('autocomplete', 'off');
  relais.dataset.slot = 'relais-clavier';
  Object.assign(relais.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    padding: '0',
    border: '0',
    opacity: '0',
    fontSize: '16px',
    pointerEvents: 'none',
  });

  const retirer = () => relais.remove();
  relais.addEventListener('blur', retirer, { once: true });
  document.body.appendChild(relais);
  relais.focus({ preventScroll: true });

  window.setTimeout(() => {
    if (!relais.isConnected) return;
    // Encore focalisé : personne n'a pris le relais. `blur` ferme le clavier ET retire le champ.
    if (document.activeElement === relais) relais.blur();
    else retirer();
  }, DELAI_DE_GARDE_MS);
}
