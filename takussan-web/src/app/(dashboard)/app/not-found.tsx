import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SearchX } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { RetourVersLaListe } from './RetourVersLaListe';

/**
 * L'introuvable DU TABLEAU DE BORD — et le mot « du » porte tout le fichier.
 *
 * Avant lui, `notFound()` n'était appelé qu'à un seul endroit de `/app`
 * (`properties/[id]`), et il n'existait aucun `not-found.tsx` dans l'arbre : Next rendait donc
 * sa page 404 par défaut, **hors du shell** — sans barre latérale, sans traduction, sans chemin
 * de retour. Un utilisateur connecté était éjecté de son produit par une faute de frappe dans
 * une URL.
 *
 * ## Pourquoi ce fichier est ICI et non sous `(dashboard)`
 *
 * Mesuré le 2026-08-27 sur Next 16.3.1 (sonde jetable, `next dev`, deux couches de layouts) :
 * un `not-found.tsx` posé sur un segment est rendu **à l'intérieur du `layout.tsx` de ce
 * segment**, et des layouts plus profonds aussi. Posé sur `(dashboard)`, il aurait été rendu par
 * `(dashboard)/layout.tsx` — la chrome nue — mais rien ne garantissait `app/layout.tsx`, qui est
 * celui qui monte `AppShell` et donc la barre latérale. Posé ici, `AppShell` est un ancêtre
 * certain. Il ne couvre par construction que `/app` ; `/admin` et `/super-admin` sont des frères,
 * hors du périmètre de TCK-382.
 *
 * ## Il ne dit pas ce qu'il ne sait pas
 *
 * L'API rend 404 pour un objet ABSENT comme pour un objet HORS PÉRIMÈTRE D'AGENCE — l'isolation
 * par agence est faite pour ne pas révéler l'existence de ce qu'on n'a pas le droit de voir. Le
 * message couvre donc les deux sans trancher. C'est la leçon que `(dashboard)/error.tsx` porte
 * dans son propre docblock : *une frontière large qui affirme une cause étroite se trompe partout
 * sauf à un endroit.*
 *
 * ⚠ Et il ne dit surtout pas « erreur ». Un refus d'accès (TCK-378) redirige, une panne rend
 * `error.tsx` **avec un bouton « réessayer »**, et l'introuvable n'en propose aucun : réessayer
 * ne fait pas exister ce qui n'existe pas. Trois écrans, trois causes, aucun bouton en commun.
 *
 * ## Le chemin de retour est DÉRIVÉ, pas décoratif
 *
 * `usePathname()` donne l'URL demandée ; la première section après `/app/` désigne la liste dont
 * l'objet manquant relève (`@/lib/navigation/app-sections`). Cette table est gardée par
 * `__tests__/introuvable.test.tsx`, qui échoue si un segment dynamique apparaît sous `/app` sans
 * y figurer, ou si une destination citée n'a pas de `page.tsx` sur le disque.
 *
 * ⚠ **Ce fichier n'est PAS `'use client'`, et ce n'est pas un détail de style.** Mesuré : un
 * `not-found.tsx` client n'est pas rendu dans le HTML de la réponse 404 — l'écran reste vide
 * jusqu'à l'hydratation. Le message et le retour au tableau de bord sont donc servis par le
 * serveur ; seul le raccourci contextuel vit dans `RetourVersLaListe`, qui porte le relevé.
 */

export default function AppNotFound() {
  const t = useTranslations('dashboard.notFound');

  return (
    <EmptyState
      data-testid="app-not-found"
      icon={<SearchX className="size-8" aria-hidden="true" />}
      title={t('title')}
      description={t('description')}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <RetourVersLaListe />
          <Link href="/app" className={buttonVariants({ variant: 'outline' })}>
            {t('backToDashboard')}
          </Link>
        </div>
      }
    />
  );
}
