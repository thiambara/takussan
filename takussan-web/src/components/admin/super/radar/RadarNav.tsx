'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Inbox, Satellite, TrendingUp, UsersRound } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fetchRadarDashboard, radarKeys } from '@/lib/queries/radar';
import type { RadarDashboardResponse } from '@/types/radar';

const ENTREES = [
  { href: '/super-admin/radar', cle: 'listings', icone: Inbox, testId: 'radar-lien-annonces' },
  { href: '/super-admin/radar/advertisers', cle: 'advertisers', icone: UsersRound, testId: 'radar-lien-annonceurs' },
  { href: '/super-admin/radar/collecte', cle: 'crawl', icone: Satellite, testId: 'radar-lien-collecte' },
  { href: '/super-admin/radar/observatory', cle: 'observatory', icone: TrendingUp, testId: 'radar-lien-observatoire' },
] as const;

/** Une entrée est courante sur sa page et ses fiches ; la liste des annonces seulement sur elle-même et ses fiches. */
function estCourante(chemin: string, href: string): boolean {
  if (href !== '/super-admin/radar') return chemin === href || chemin.startsWith(`${href}/`);
  return chemin === href || /^\/super-admin\/radar\/\d+/.test(chemin);
}

/**
 * TCK-2461 — la navigation du Radar. Les quatre espaces se rejoignaient par trois boutons posés sur la seule liste
 * des annonces, puis par un « Retour » ; on se déplace désormais d'un clic, depuis n'importe lequel, et on voit où
 * l'on est. La pastille des relances dues garde la même lecture que les compteurs de la liste de travail.
 */
export function RadarNav() {
  const t = useTranslations('superAdmin.pages.radar.nav');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const chemin = usePathname() ?? '';
  const { can } = usePlatformAbilities();
  const tableau = useQuery<RadarDashboardResponse, ApiError>({
    queryKey: radarKeys.dashboard(),
    queryFn: fetchRadarDashboard,
    staleTime: 10_000,
    enabled: can('platform.radar.operate'),
  });
  const relancesDues = tableau.data?.data.follow_ups_due ?? 0;

  return (
    <nav aria-label={t('aria')} className="overflow-x-auto border-b border-border" data-testid="radar-nav">
      <ul className="flex min-w-max items-center gap-1">
        {ENTREES.map(({ href, cle, icone: Icone, testId }) => {
          const courante = estCourante(chemin, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={courante ? 'page' : undefined}
                data-testid={testId}
                className={cn(
                  '-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  courante
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <Icone className="size-4" aria-hidden="true" />
                {t(cle)}
                {cle === 'advertisers' && relancesDues > 0 ? (
                  <span
                    className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums"
                    title={tRadar('followUpsDue', { count: relancesDues })}
                    data-testid="radar-relances-dues"
                  >
                    <span aria-hidden="true">{relancesDues}</span>
                    <span className="sr-only">{tRadar('followUpsDue', { count: relancesDues })}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
