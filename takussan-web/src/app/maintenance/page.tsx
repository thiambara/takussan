'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import type { MaintenanceStatusResponse } from '@/types/super-admin';

async function fetchStatus(): Promise<MaintenanceStatusResponse> {
  const res = await fetch('/api/maintenance/status');
  return res.json() as Promise<MaintenanceStatusResponse>;
}

export default function MaintenancePage() {
  const t = useTranslations('errors.maintenance');
  const locale = useLocale();
  const query = useQuery({ queryKey: ['maintenance-status'], queryFn: fetchStatus, refetchInterval: 60_000 });
  const window = query.data?.data.window;
  // Le message de fenêtre vient du super-admin, qui le rédige lui-même par locale ; seul le
  // repli est à nous. `messages` ne porte que `fr` côté API — d'où le repli sur `fr` puis sur
  // notre propre libellé traduit.
  const message = window?.messages.fr ?? t('defaultMessage');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="max-w-xl rounded-xl bg-white p-8 text-center ring-1 ring-border">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">{t('eyebrow')}</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-4 text-muted-foreground">{message}</p>
        {window ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t('backAt', { date: new Date(window.ends_at).toLocaleString(`${locale}-SN`) })}
          </p>
        ) : null}
      </section>
    </main>
  );
}
