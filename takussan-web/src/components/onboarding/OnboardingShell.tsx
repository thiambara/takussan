import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { CoqueDEntree } from '@/components/entree/CoqueDEntree';
import { libellesDeLaCoque } from '@/components/entree/libelles-de-la-coque';

/**
 * Cadre commun des assistants d'onboarding.
 *
 * ⚠ **Pourquoi un composant et pas quatre en-têtes.** `host`, `owner`, `agent` et
 * `service-provider` portaient le MÊME bloc de coque, recopié quatre fois au
 * caractère près (`min-h-[80vh] bg-background px-4 py-12` → `max-w-3xl` →
 * `<header className="mb-8 text-center">`). Une correction de coque devait donc
 * être appliquée quatre fois pour être vraie, et ne l'a jamais été qu'une.
 *
 * Trois décisions portées ici :
 *
 * 1. **Une barre d'identité.** L'assistant est servi hors `(dashboard)` et hors
 *    `(public)` : il n'héritait d'AUCUNE chrome. On sortait donc d'un site
 *    marqué pour atterrir sur un formulaire nu, sans logo et sans issue — la
 *    seule façon d'en repartir était le bouton *Précédent* du navigateur.
 * 2. **L'alignement à gauche.** L'en-tête était centré au-dessus d'un formulaire
 *    aligné à gauche : deux axes, rien à quoi s'aligner. Le titre partage
 *    désormais l'arête gauche du rail d'étapes.
 * 3. **La sauvegarde automatique se DIT — là où elle a lieu, et nulle part ailleurs.**
 *    `WizardReprenable` enregistre chaque saisie depuis TCK-250, et rien à l'écran
 *    ne l'annonçait avant de quitter la page. Mais la note était la valeur PAR
 *    DÉFAUT de la coque : l'écran du prénom, la page d'invitation et l'accueil
 *    multi-agences la promettaient sans rien enregistrer (TCK-2616). Elle ne
 *    s'affiche plus que sur demande (`brouillon`) : un écran neuf ne promet rien.
 *
 * TCK-2598 — la barre est désormais celle de la coque d'entrée commune (`CoqueDEntree`) : la marque,
 * l'intention et l'avancement quand l'écran les donne, « Retour au site » — qui demande confirmation
 * quand l'écran déclare une saisie (`DeclarerEntree saisie`).
 */
export async function OnboardingShell({
  title,
  subtitle,
  brouillon = false,
  note,
  intention,
  pas,
  total,
  largeur = 'large',
  children,
}: {
  /**
   * Absent quand l'écran porte lui-même son `h1` (l'accueil de l'admin d'agence, dont le titre
   * change d'une étape à l'autre) : la coque ne fournit alors que la barre et le pied.
   */
  readonly title?: string;
  readonly subtitle?: string;
  /**
   * L'écran enregistre RÉELLEMENT un brouillon (`WizardReprenable`) : le pied de page le dit.
   * Absent, aucune promesse — TCK-2616 : c'était le défaut, et trois écrans sans brouillon
   * l'affichaient.
   */
  readonly brouillon?: boolean;
  /**
   * Un pied de page propre à l'écran (TCK-493 : l'orientation dit que la réponse n'engage à
   * rien). Il prime sur la note de brouillon.
   */
  readonly note?: string;
  /** TCK-2598 — l'intention, titre de la barre de la coque (« Votre compte est créé »). */
  readonly intention?: string;
  /** TCK-2598 — l'avancement du parcours entier, compte compris. */
  readonly pas?: number;
  readonly total?: number;
  /**
   * TCK-2598 — `etroite` : la colonne de 480 px des maquettes (prénom, invitation). Défaut `large` :
   * les assistants gardent leur largeur d'avant tant que leurs tickets ne les refont pas.
   */
  readonly largeur?: 'etroite' | 'large';
  readonly children: React.ReactNode;
}) {
  const t = await getTranslations('onboarding.shell');
  const libelles = await libellesDeLaCoque();
  const piedDePage = note ?? (brouillon ? t('autosave') : null);

  return (
    <CoqueDEntree
      libelles={libelles}
      titre={intention}
      pas={pas}
      total={total}
      largeur={largeur}
      sortie={{ href: '/', forme: 'retour-au-site' }}
    >
      {title ? (
        <div className="mb-8 flex flex-col gap-3 sm:mb-10">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-[62ch] text-[calc(var(--spacing)*3.75)] leading-relaxed text-pretty text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      {children}

      {piedDePage ? (
        <footer className="mt-10">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-pretty text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {piedDePage}
          </p>
        </footer>
      ) : null}
    </CoqueDEntree>
  );
}
