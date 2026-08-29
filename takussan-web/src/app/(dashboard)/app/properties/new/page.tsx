import type { Metadata } from 'next';


import { fetchTagsAction } from '@/app/actions/admin-tags';
import { PropertyWizard } from '@/components/property-form';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

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
 * ⚠ La description de `PageHeader` (« Remplissez les informations essentielles ») décrivait le
 * formulaire long ; elle est retirée plutôt que réécrite : le sous-titre de chaque étape porte
 * désormais cette conduite, et la hauteur qu'elle occupait est prise sur la zone défilante du
 * parcours. Le `<h1>`, lui, reste — c'est le seul titre de niveau 1 de la route.
 */
export default async function Page() {
  const t = await getTranslations('dashboard.pages.propertyNew');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' }, perPage: 200 });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];

  return (
    <div className="absolute inset-0 flex flex-col gap-4 overflow-hidden px-4 py-6 md:px-6 md:py-8">
      <PageHeader title={t('title')} className="shrink-0" />
      <div className="min-h-0 flex-1">
        <PropertyWizard tags={tags} />
      </div>
    </div>
  );
}
