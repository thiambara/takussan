import type { Metadata } from 'next';


import Link from 'next/link';

import { fetchTagsAction } from '@/app/actions/admin-tags';
import { fetchListingQuotaAction } from '@/app/actions/dashboard-properties';
import { buttonVariants } from '@/components/ui/button';
import { PropertyWizard } from '@/components/property-form';
import { EnTetePublication } from '@/components/property-form/wizard/EnTetePublication';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent } from '@/lib/roles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.propertyNew');
  return { title: t('metaTitle') };
}

export const dynamic = 'force-dynamic';

/**
 * TCK-464 — la publication d'un bien passe du formulaire long au parcours guidé, et cette page
 * ne fait plus qu'une chose de plus que rendre le composant : **elle lui fournit une boîte de
 * hauteur BORNÉE**.
 *
 * ## Pourquoi c'est ici et pas dans le parcours
 *
 * L'AC9 exige que le moyen d'avancer ne quitte jamais l'écran. `WizardShell` place donc son pied
 * HORS de la zone défilante et se dimensionne en `h-full min-h-0`. Mais `h-full` ne borne rien si
 * son parent n'est pas borné, et il ne l'est pas : `AppShell` rend
 *
 *     <main className="relative min-h-0 flex-1 overflow-y-auto">
 *       <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
 *     </main>
 *
 * Le `<main>` est bien borné par la colonne `h-screen` de la coquille — mais le `<div>` qui
 * enveloppe `children` a une hauteur AUTO, et un `height: 100%` résolu contre un parent en
 * hauteur auto se comporte comme `height: auto`. Monté tel quel, le parcours prendrait la hauteur
 * de son contenu, sa zone défilante ne défilerait jamais, et c'est la page entière qui
 * défilerait — **en emportant le pied**, exactement le cas que l'AC existe pour couvrir.
 *
 * ## La solution retenue : sortir de l'enveloppe rembourrée, sans y toucher
 *
 * `position: absolute; inset: 0` prend pour bloc conteneur la **boîte de rembourrage du plus
 * proche ancêtre positionné** — c'est-à-dire le `<main>`, qui est déjà `relative` et déjà borné.
 * La page occupe donc exactement le rectangle visible, et reprend à son compte le rembourrage que
 * le `<div>` intermédiaire ne lui applique plus (celui-ci se réduit à une hauteur nulle, n'ayant
 * plus que des enfants hors flux : le `<main>` n'a alors plus rien à faire défiler).
 *
 * L'autre voie possible — borner le `<div>` d'`AppShell` (`min-h-full flex flex-col`) — aurait
 * changé le contexte de mise en page des ~110 autres pages du tableau de bord pour le seul besoin
 * de celle-ci. *Une correction dont la portée dépasse le défaut qu'elle corrige se paie ailleurs,
 * et plus tard.* Celle-ci ne touche qu'une route.
 *
 * ⚠ **Rien de tout cela n'est vérifiable sous jsdom**, qui ne calcule aucune mise en page : un
 * test vert ne dit rien ici, et aucun n'a été écrit pour le prétendre. La vérification se fait
 * au navigateur — cf. le rapport de la tâche.
 *
 * TCK-631 — la route est PLEIN ÉCRAN (`components/layout/plein-ecran.ts`) : `AppShell` n'y rend
 * ni sa barre du haut ni sa barre latérale, et `<main>` n'a plus de rembourrage à reprendre ici.
 * La page ne porte plus de `PageHeader` non plus : il disait « Publier un bien » une troisième
 * fois (menu, titre de page, titre d'étape). Le titre de l'étape devient le `<h1>` de la route,
 * l'en-tête du parcours dit ce qu'on fait, et le quota passe dans la colonne d'aperçu.
 *
 * Le refus de quota, lui, n'a pas de parcours : il reçoit le même en-tête, pour que la route
 * garde une marque et une sortie maintenant que la console s'est retirée.
 */
export default async function Page() {
  const t = await getTranslations('dashboard.pages.propertyNew');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' }, perPage: 200 });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];
  // TCK-587 — même vocabulaire que la barre latérale : le bailleur hors personnel propose.
  const { roles } = await getMeAction();
  const proposition = !isAgent(roles) && !isAdmin(roles);
  // TCK-627 — une proposition reste un brouillon de l'agence : elle ne consomme aucun quota.
  const quota = proposition ? null : await fetchListingQuotaAction();

  const titre = proposition ? t('proposalTitle') : t('title');

  if (quota && !quota.can_create) {
    return (
      <div className="absolute inset-0 flex flex-col overflow-y-auto">
        <EnTetePublication titre={titre} enregistrement="aucun" />
        <div className="flex flex-col gap-6 px-4 py-6 sm:px-8 md:py-10">
          <PageHeader title={titre} />
          <section
            role="alert"
            className="flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-card px-5 py-5"
            data-testid="quota-atteint"
          >
            <h2 className="font-display text-lg font-semibold text-foreground">{t('quotaReachedTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('quotaReachedBody', { used: quota.used, limit: quota.limit ?? 0 })}
            </p>
            <div className="flex flex-wrap gap-2">
              {isAdmin(roles) ? (
                <Link href="/admin/agency/billing" className={buttonVariants({ size: 'sm' })}>
                  {t('quotaReachedUpgrade')}
                </Link>
              ) : null}
              <Link href="/app/properties" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                {t('quotaReachedManage')}
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <PropertyWizard
        tags={tags}
        proposition={proposition}
        quotaNote={
          quota && quota.limit !== null
            ? t('quotaUsage', { used: quota.used, limit: quota.limit })
            : undefined
        }
      />
    </div>
  );
}
