'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { MaintenanceStatusResponse, MaintenanceWindow } from '@/types/super-admin';

async function fetchStatus(): Promise<MaintenanceStatusResponse> {
  const res = await fetch('/api/maintenance/status');
  return res.json() as Promise<MaintenanceStatusResponse>;
}

/**
 * TCK-572 — l'avis se ferme, pour la session, et revient quand il CHANGE : la même fenêtre qui
 * passe d'« annoncée » à « en cours », ou dont la fin est repoussée, est un autre avis.
 */
const CLE_MASQUAGE = 'takussan:maintenance-masquee';

function empreinte(fenetre: MaintenanceWindow, active: boolean): string {
  return `${fenetre.id}:${active ? 'en-cours' : 'annoncee'}:${fenetre.ends_at}`;
}

function lireMasquage(): string | null {
  try {
    return window.sessionStorage.getItem(CLE_MASQUAGE);
  } catch {
    return null;
  }
}

function ecrireMasquage(valeur: string): void {
  try {
    window.sessionStorage.setItem(CLE_MASQUAGE, valeur);
  } catch {
    // Stockage refusé (navigation privée) : l'avis reste masqué jusqu'au prochain chargement.
  }
}

export function MaintenanceBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('announcements');
  const locale = useLocale();
  const { dateTime } = useFormatteurs();
  const query = useQuery({ queryKey: ['maintenance-status'], queryFn: fetchStatus, refetchInterval: 60_000 });
  const status = query.data?.data;
  const fenetre = status?.window;
  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;
  const [masque, setMasque] = useState<string | null>(lireMasquage);

  useEffect(() => {
    if (status?.active && fenetre?.mode === 'down' && !isSuperAdmin && pathname !== '/maintenance') {
      router.replace('/maintenance');
    }
  }, [isSuperAdmin, pathname, router, status?.active, fenetre?.mode]);

  if (!status?.show_banner || !fenetre || pathname === '/maintenance') return null;
  const courante = empreinte(fenetre, status.active);
  if (masque === courante) return null;

  // Les tons de `GlobalAnnouncementBanner` : jetons de la palette, jamais l'échelle Tailwind brute —
  // l'avis est rendu dans `/app` depuis TCK-572, où `check-super-admin-tokens` le lit.
  const tone = fenetre.severity === 'interruption' || fenetre.mode === 'down'
    ? 'bg-destructive text-background'
    : 'bg-warning text-warning-foreground';
  const message = (locale === 'en' || locale === 'wo' ? fenetre.messages[locale] : null) || fenetre.messages.fr;
  const masquer = () => {
    ecrireMasquage(courante);
    setMasque(courante);
  };

  // En FLUX, et non plus `sticky top-0 z-50` : collé, il passait sous la barre publique fixe et
  // recouvrait la barre haute de la console une fois la page défilée (TCK-572).
  return (
    <div data-bandeau="maintenance" className={cn(tone, 'px-4 py-2 text-sm shadow-sm')}>
      <div className="mx-auto flex max-w-7xl items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          {message}
          {' '}
          <span className="font-medium">
            {t('maintenanceWindow', { debut: dateTime(fenetre.starts_at), fin: dateTime(fenetre.ends_at) })}
          </span>
        </p>
        {/* 44 px touchables au moins : 32 px visibles (40 sous `sm`, plancher du `Button`), plus
            `after:-inset-2` — la croix de `GlobalAnnouncementBanner`. Le `::after` part de la
            boîte de PADDING : 32 − 2 × 1 px de bordure + 2 × 8 = 46 au-delà de `sm` (54 en deçà).
            `-inset-1.5` donnait 42, mesuré à 1366 px (reprise du 2026-09-24). */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-8 shrink-0 text-current after:absolute after:-inset-2 hover:bg-background/15 hover:text-current"
          aria-label={t('maintenanceDismissAria')}
          onClick={masquer}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
