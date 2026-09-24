import type { LucideIcon } from 'lucide-react';

type WelcomeIllustrationProps = {
  /** L'icône Lucide qui résume la diapositive (charte : Lucide uniquement). */
  readonly icon: LucideIcon;
};

/**
 * TCK-567 (M10) — le dessin d'une diapositive de `<WelcomeModal>`.
 *
 * La spec de TCK-251 prévoit une « illustration au-dessus » du titre, et `WelcomeSlide` la
 * portait depuis l'origine — mais AUCUN des cinq parcours n'en passait. Sur téléphone, où la
 * modale est plein écran, la hauteur qu'elle devait occuper restait blanche : c'est le bloc vide
 * relevé par le testeur le 2026-09-23.
 *
 * Un seul dessin pour tous les parcours, pour que les carrousels se ressemblent : deux halos
 * terracotta et l'icône dans une pastille `bg-card`. Rien que des jetons (palette Lin,
 * `docs/design-guidelines.md`) — le thème sombre suit sans règle de plus.
 *
 * ⚠ CE COMPOSANT NE PEINT PAS LA SURFACE, et c'est voulu. Le panneau `bg-muted` et sa hauteur
 * sont portés par UN SEUL élément, la boîte `welcome-illustration` de `<WelcomeModal>`. Tant que
 * la hauteur était sur la boîte et la peinture ici (`h-full`), retirer `h-full` rendait un
 * panneau de 80 px dans une boîte de 320 : le bloc blanc du testeur revenait, suite verte
 * (vérification adverse du 2026-09-23). Ce qui ne dépend plus d'une propagation ne peut plus la
 * perdre. Les halos se dimensionnent en proportion de cette boîte (`absolute`, en `%`) — elle
 * est leur bloc conteneur.
 *
 * Décoratif : `aria-hidden`. Le sens est dans le titre et le corps de la diapositive, que le
 * dialogue annonce déjà ; une icône lue en plus n'apprendrait rien.
 */
export function WelcomeIllustration({ icon: Icon }: WelcomeIllustrationProps) {
  return (
    <>
      <span aria-hidden="true" className="absolute aspect-square h-[85%] rounded-full bg-primary/5" />
      <span aria-hidden="true" className="absolute aspect-square h-[60%] rounded-full bg-primary/10" />
      <span
        aria-hidden="true"
        className="relative flex size-20 items-center justify-center rounded-full bg-card text-primary ring-1 ring-border"
      >
        <Icon className="size-9" strokeWidth={1.5} />
      </span>
    </>
  );
}
