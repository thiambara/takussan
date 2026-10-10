'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { BarreDeMarque } from '@/components/brand/BarreDeMarque';
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
  // repli est à nous. Le type admet `en` et `wo` optionnels : on lit celui de la locale quand
  // il est rédigé, sinon `fr` (le seul que l'API garantit), sinon notre libellé traduit.
  const messages = window?.messages;
  const message =
    messages?.[locale as keyof typeof messages] || messages?.fr || t('defaultMessage');

  return (
    // TCK-621 — l'écran de maintenance est servi seul, sans coque : il porte sa propre marque.
    <div className="flex min-h-dvh flex-col bg-background">
      <BarreDeMarque largeur="max-w-2xl" />
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <section className="w-full max-w-xl rounded-xl bg-card p-6 text-center ring-1 ring-border sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">{t('eyebrow')}</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance text-foreground">{t('title')}</h1>
          <p className="mt-4 text-pretty text-muted-foreground">{message}</p>
          {window ? (
            <p className="mt-4 text-sm tabular-nums text-muted-foreground">
              {t('backAt', { date: new Date(window.ends_at).toLocaleString(`${locale}-SN`) })}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
