'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

import { ENCRE_DE_L_ETAT, type EtatDEngagement, type ProjectionEngagement } from './engagement';
import { engagementsDuFilQueryKey } from './useGesteDEngagement';

const GROUPES = [
  { cle: 'ouverts', etats: ['late', 'proposed', 'open'] },
  { cle: 'tenus', etats: ['kept'] },
  { cle: 'annules', etats: ['cancelled'] },
] as const satisfies readonly { cle: string; etats: readonly EtatDEngagement[] }[];

/**
 * TCK-2972 (ADR-0130) — « Engagements de ce fil » : Ouverts · Tenus · Annulés, dans la colonne de droite
 * au bureau et le dossier du fil au téléphone. `GET /api/conversations/{id}/commitments` rend la
 * projection de chaque engagement, déjà triée (« en retard, puis par échéance, puis clos »).
 *
 * ⚠ La route ne lit aucun `fields[…]` (pas de `spatie/laravel-query-builder` sur `index`, TCK-2969) :
 * la projection est fixe, aucun sparse fieldset n'est envoyé.
 *
 * Aucun engagement : la section ne s'affiche pas. Elle se relit avec le fil, après un geste
 * (`engagementsDuFilQueryKey`).
 */
export function EngagementsDuFil({ conversationId }: { readonly conversationId: number }) {
  const t = useTranslations('messaging.engagements.liste');
  const tEtat = useTranslations('messaging.engagements.carte.etat');
  const f = useFormatteurs();
  const [maintenant] = useState(() => Date.now());
  const { data } = useApiQuery<{ data: ProjectionEngagement[] }>(
    [...engagementsDuFilQueryKey(conversationId)],
    cheminApi`/api/conversations/${conversationId}/commitments`,
  );
  const engagements = data?.data ?? [];
  if (engagements.length === 0) return null;

  return (
    <section data-testid="engagements-du-fil" className="mt-5" aria-label={t('titre')}>
      <h3 className="text-sm font-semibold text-foreground">{t('titre')}</h3>
      {GROUPES.map(({ cle, etats }) => {
        const lignes = engagements.filter((e) => (etats as readonly string[]).includes(e.etat));
        if (lignes.length === 0) return null;
        return (
          <div key={cle} className="mt-3" data-testid={`engagements-${cle}`}>
            <p className="mb-1 text-ui font-semibold">{t(cle, { n: lignes.length })}</p>
            <ul className="divide-y divide-border/70 rounded-xl bg-muted/60 px-3.5">
              {lignes.map((e) => {
                const enRetard = e.etat === 'late' || (e.etat === 'open' && e.due_at !== null && new Date(e.due_at).getTime() < maintenant);
                const etatAffiche: EtatDEngagement = enRetard ? 'late' : e.etat;
                return (
                  <li key={e.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <p className={cn('min-w-0 flex-1 truncate text-sm font-medium', e.etat === 'cancelled' && 'text-muted-foreground line-through')}>
                        {e.title?.trim() || t('sansTitre')}
                      </p>
                      <span className={cn('flex-none text-xs font-medium', ENCRE_DE_L_ETAT[etatAffiche])}>{tEtat(etatAffiche)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {e.holder?.name ?? '—'}
                      {e.due_at ? ` · ${f.dateTime(e.due_at)}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
