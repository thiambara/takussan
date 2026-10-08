'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';

import { useImpersonationCourante, useQuitterImpersonation } from '@/hooks/useImpersonation';
import { useFormatteurs } from '@/lib/format/useFormatteurs';

/** Retour à la fiche de la cible dans la console, ou à la liste si elle n'est plus connue. */
function ficheDeLaCible(id: number | null | undefined): string {
  return id ? `/super-admin/users/${id}` : '/super-admin/users';
}

/**
 * TCK-600 (ADR-0055 §6) — la bannière d'une session d'impersonation, montée dans l'ESPACE
 * APPLICATIF (elle ne l'était que dans la console, où l'opérateur ne lit justement pas en tant que
 * la cible). Non masquable : cible, « lecture seule », heure de fin, « Quitter ».
 *
 * À l'échéance, la session se termine d'elle-même : les cookies tombent et l'opérateur revient à
 * la console. La session est lue sur `GET /api/impersonation/current` — jamais dans un stockage du
 * navigateur.
 */
export function ImpersonationBanner() {
  const t = useTranslations('impersonation.banner');
  const fmt = useFormatteurs();
  const { data: session } = useImpersonationCourante();
  const quitter = useQuitterImpersonation();

  const fin = session ? new Date(session.expires_at).getTime() : Number.NaN;
  const cible = session?.target.id;

  useEffect(() => {
    if (!Number.isFinite(fin)) return;
    const minuterie = window.setTimeout(
      () => {
        quitter.mutate(undefined, { onSettled: () => window.location.assign(ficheDeLaCible(cible)) });
      },
      Math.max(0, fin - Date.now()),
    );
    return () => window.clearTimeout(minuterie);
    // `quitter` change d'identité à chaque rendu : la minuterie ne dépend que de l'échéance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fin, cible]);

  if (!session) return null;

  return (
    <div
      role="status"
      data-testid="impersonation-banner"
      className="flex flex-wrap items-center justify-between gap-3 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="size-4 shrink-0" aria-hidden="true" />
        <span className="text-pretty">
          {t('message', {
            target: session.target.name || t('fallbackUser', { id: session.target.id ?? 0 }),
            ends: Number.isFinite(fin) ? fmt.dateTime(new Date(fin), { hour: '2-digit', minute: '2-digit' }) : t('unknownEnd'),
          })}
        </span>
      </div>
      <button
        type="button"
        onClick={() =>
          quitter.mutate(undefined, { onSettled: () => window.location.assign(ficheDeLaCible(cible)) })
        }
        disabled={quitter.isPending}
        // Pastille PLEINE et inversée : l'encre du bandeau posée en fond, l'ocre en texte (5,95:1,
        // mesuré le 2026-08-27 ; le voile `warning-foreground/15` mesurait 4,32:1).
        className="inline-flex items-center rounded-md bg-warning-foreground px-3 py-1 text-xs font-semibold text-warning transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {quitter.isPending ? t('leaving') : t('leave')}
      </button>
    </div>
  );
}
