import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

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
 * 3. **La sauvegarde automatique se DIT.** `WizardReprenable` enregistre chaque
 *    saisie depuis TCK-250, et rien à l'écran ne l'annonçait avant de quitter la
 *    page. Une promesse qu'on ne tient qu'après coup ne rassure personne pendant.
 */
export async function OnboardingShell({
  title,
  subtitle,
  note,
  children,
}: {
  /**
   * Absent quand l'écran porte lui-même son `h1` (l'accueil de l'admin d'agence, dont le titre
   * change d'une étape à l'autre) : la coque ne fournit alors que la barre et le pied.
   */
  readonly title?: string;
  readonly subtitle?: string;
  /**
   * Remplace la mention de sauvegarde automatique en pied de page.
   *
   * TCK-493 — la coque sert désormais un écran qui n'est PAS un assistant : la
   * question d'orientation posée après l'inscription n'enregistre rien au fil de
   * la saisie. Lui laisser la promesse « vos réponses sont enregistrées
   * automatiquement » serait une affirmation fausse, sur le premier écran que
   * voit un compte neuf. `null` retire le pied de page : un écran qui n'a rien à
   * promettre ne promet rien.
   */
  readonly note?: string | null;
  readonly children: React.ReactNode;
}) {
  const t = await getTranslations('onboarding.shell');
  // Le nom de marque passe par `common.appName` comme partout ailleurs : la
  // garde i18n refuse un libellé en dur sur un fichier neuf, et elle a raison —
  // un nom écrit à douze endroits est un nom qu'on ne peut plus changer.
  const tCommon = await getTranslations('common');

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tight text-foreground transition-colors hover:text-primary"
          >
            {tCommon('appName')}
          </Link>
          <Link
            href="/"
            className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('exit')}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        {title ? (
          <div className="mb-8 flex flex-col gap-3 sm:mb-10">
            <h1 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-[62ch] text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}

        {children}
      </main>

      {note === null ? null : (
        <footer className="mx-auto w-full max-w-4xl px-4 pb-10 sm:px-6">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-pretty text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {note ?? t('autosave')}
          </p>
        </footer>
      )}
    </div>
  );
}
