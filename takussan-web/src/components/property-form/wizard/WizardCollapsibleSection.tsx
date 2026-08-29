'use client';

/**
 * TCK-464 — une section qui se replie SANS rester atteignable au clavier.
 *
 * Deux étapes (`StepLieu` — détail d'adresse — et `StepPrix` — bloc de location) repliaient un
 * bloc de champs par le même montage exact, copié-collé : même transition de hauteur, même couple
 * `aria-hidden` + `inert`, même commentaire. Deux exemplaires d'une sémantique d'accessibilité,
 * c'est un exemplaire de trop — le jour où l'un gagne un correctif, l'autre ne le sait pas. C'est
 * donc ICI, et nulle part ailleurs, que vit la réponse à la question qui a produit le doublon :
 *
 * ⚠ **`aria-hidden` seul ne suffit PAS sur des champs focusables.** Le bloc replié reste dans le
 * DOM pour que la transition de hauteur existe — un `display:none` le ferait surgir sous le doigt
 * au dépli, ce qui est précisément ce qui fait rater une cible tactile. Mais tant qu'il reste dans
 * le DOM, ses champs restent atteignables au TABULATEUR même invisibles, et `aria-hidden` sur un
 * élément focusable est en soi une violation d'accessibilité. Il faut donc le retirer À LA FOIS de
 * l'arbre d'accessibilité (`aria-hidden`) ET du parcours clavier (`inert`, natif en React 19).
 *
 * `grid-template-rows: 0fr → 1fr` (et non `max-height`) : la hauteur cible n'a pas besoin d'être
 * connue à l'avance, et l'animation reste fluide même si le contenu change.
 */
export function WizardCollapsibleSection({
  open,
  id,
  testId,
  children,
}: {
  readonly open: boolean;
  readonly id?: string;
  readonly testId?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      data-testid={testId}
      aria-hidden={!open}
      inert={!open}
      className="grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
