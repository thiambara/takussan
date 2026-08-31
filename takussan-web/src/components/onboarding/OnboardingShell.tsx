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
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
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
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('exit')}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <div className="mb-10 flex flex-col gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>

        {children}
      </main>

      <footer className="mx-auto w-full max-w-4xl px-4 pb-10 sm:px-6">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          {t('autosave')}
        </p>
      </footer>
    </div>
  );
}
