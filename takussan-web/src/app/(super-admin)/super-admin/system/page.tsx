import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Activity, CalendarClock, SlidersHorizontal, Wrench } from 'lucide-react';
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
 * page apportait vraiment — l'entrée vers ses trois sous-pages et vers les paramètres.
 *
 * Elle n'est pas supprimée : la barre latérale l'affiche comme parent d'un groupe et son `href`
 * doit mener quelque part. Une entrée de menu qui ouvre une page vide est pire qu'un index.
 */
const ENTRIES = [
  { href: '/super-admin/system/health', labelKey: 'healthcheck', icon: Activity },
  { href: '/super-admin/system/maintenance', labelKey: 'maintenance', icon: Wrench },
  { href: '/super-admin/system/scheduler', labelKey: 'scheduler', icon: CalendarClock },
  { href: '/super-admin/settings', labelKey: 'openSettings', icon: SlidersHorizontal },
] as const;

export default async function SuperAdminSystemPage() {
  const t = await getTranslations('superAdmin.pages.system');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {ENTRIES.map((entry) => {
          const Icon = entry.icon;

          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="flex h-full items-start gap-3 rounded-xl bg-card p-5 ring-1 ring-border transition-colors hover:bg-muted/40"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">
                    {t(`globalSettings.${entry.labelKey}`)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {t(`entries.${entry.labelKey}`)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
