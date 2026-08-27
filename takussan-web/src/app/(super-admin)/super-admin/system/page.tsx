import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Activity, CalendarClock, ListX, SlidersHorizontal, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.system');
  return { title: t('metaTitle') };
}

/**
 * TCK-360 — `/super-admin/system` est un INDEX, plus un second tableau de bord.
 *
 * Cette page rendait `<SystemMetricsGrid />` — la grille de huit tuiles de l'accueil, à
 * l'identique — suivie de quatre boutons. *Deux pages qui affichent la même chose sont une page* :
 * la grille n'existe plus qu'à un seul endroit, l'accueil, et il ne reste ici que ce que cette
 * page apportait vraiment — l'entrée vers ses sous-pages et vers les paramètres.
 *
 * Elle n'est pas supprimée : la barre latérale l'affiche comme parent d'un groupe et son `href`
 * doit mener quelque part. Une entrée de menu qui ouvre une page vide est pire qu'un index.
 */
export default async function SuperAdminSystemPage() {
  const t = await getTranslations('superAdmin.pages.system');
  // TCK-365 — la console des jobs échoués n'a pas d'entrée dans `pages.system.entries` : elle
  // emprunte le titre et le sous-titre de SA page. C'est la même paire que le lecteur retrouvera
  // en arrivant, et ça évite un troisième endroit où décrire le même écran.
  const tJobs = await getTranslations('superAdmin.pages.failedJobs');

  /**
   * L'ordre suit celui du groupe « Système » de la barre latérale, paramètres en dernier.
   *
   * ⚠ Ce hub listait santé / maintenance / scheduler / paramètres pendant que la barre latérale
   * portait QUATRE enfants : les jobs échoués manquaient. Une porte de moins vers la page neuve,
   * sur trois — et le docblock ci-dessus dit précisément pourquoi cet index existe.
   */
  const entries = [
    {
      href: '/super-admin/system/health',
      label: t('globalSettings.healthcheck'),
      description: t('entries.healthcheck'),
      icon: Activity,
    },
    {
      href: '/super-admin/system/jobs',
      label: tJobs('title'),
      description: tJobs('subtitle'),
      icon: ListX,
    },
    {
      href: '/super-admin/system/maintenance',
      label: t('globalSettings.maintenance'),
      description: t('entries.maintenance'),
      icon: Wrench,
    },
    {
      href: '/super-admin/system/scheduler',
      label: t('globalSettings.scheduler'),
      description: t('entries.scheduler'),
      icon: CalendarClock,
    },
    {
      href: '/super-admin/settings',
      label: t('globalSettings.openSettings'),
      description: t('entries.openSettings'),
      icon: SlidersHorizontal,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => {
          const Icon = entry.icon;

          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="flex h-full items-start gap-3 rounded-xl bg-card p-5 ring-1 ring-border transition-colors hover:bg-muted/40"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{entry.label}</span>
                  <span className="block text-sm text-muted-foreground">{entry.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
