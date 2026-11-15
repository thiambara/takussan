'use client';

import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cleDuJournal } from '@/lib/maintenance/journal';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { useMaintenanceJournal, type EntreeDuJournal } from '@/lib/queries/maintenance';
import { cn } from '@/lib/utils';

/**
 * TCK-2786 — le journal de la demande (maquette TCK-2653) : une colonne calme, en liste
 * chronologique — l'heure, puis quoi, puis qui. Servi par l'API au personnel de l'agence du bien
 * (`abilities.can_view_journal`) ; rien ne s'affiche pour un autre lecteur. Les libellés sont ici,
 * l'API n'émet que des codes.
 */
export function JournalDeLaDemande({ request, maintenant, className }: { readonly request: InterventionEnFile; readonly maintenant: Date; readonly className?: string }) {
  const t = useTranslations('maintenance.journal');
  const permis = request.abilities?.can_view_journal === true;
  const journal = useMaintenanceJournal(request.id, permis);
  if (!permis) return null;

  const entrees = journal.data?.data ?? [];
  return (
    <section data-slot="journal" className={cn('rounded-xl border border-border bg-card p-4 md:p-5', className)}>
      <h2 className="font-display text-base font-semibold">{t('titre')}</h2>
      {journal.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('chargement')}</p>
      ) : journal.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">{t('echec')}</p>
      ) : entrees.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('vide')}</p>
      ) : (
        <ol className="mt-3 space-y-2.5 text-sm">
          {entrees.map((e, i) => (
            <Entree key={e.id ?? `avant-${i}`} e={e} maintenant={maintenant} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Entree({ e, maintenant }: { readonly e: EntreeDuJournal; readonly maintenant: Date }) {
  const t = useTranslations('maintenance.journal');
  const tStatut = useTranslations('maintenance.status');
  const f = useFormatteurs();
  const cle = cleDuJournal(e.code);
  const quoi = cle === 'status_transition' && e.to ? t('codes.status_transition', { statut: tStatut(e.to) }) : t(`codes.${cle}`);
  const qui = cle === 'journal_before' ? t('avantLeJournal') : e.actor ? t('par', { nom: e.actor.full_name }) : t('systeme');
  return (
    <li data-code={e.code} className="flex gap-3">
      <span className="w-14 flex-none leading-tight text-muted-foreground tabular-nums">
        {e.at ? (
          <>
            <span className="block">{f.heure(e.at)}</span>
            <span className="block text-xs">{f.jourMois(e.at, maintenant)}</span>
          </>
        ) : (
          '—'
        )}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block">{quoi}</span>
        <span className="block text-xs text-muted-foreground">{qui}</span>
      </span>
    </li>
  );
}
