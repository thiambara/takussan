'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

import { ENCRE_DE_L_ETAT, type EtatDEngagement, type ProjectionEngagement } from './engagement';

/** Les puces de l'onglet, et le filtre qu'elles envoient AU SERVEUR (`filter[role]`, `filter[etat]`). */
export const PUCES_DES_ENGAGEMENTS = {
  tous: {},
  owed: { role: 'owed' },
  mine: { role: 'mine' },
  tenus: { etat: 'kept' },
  annules: { etat: 'cancelled' },
} as const satisfies Record<string, { role?: 'owed' | 'mine'; etat?: EtatDEngagement }>;
export type PuceDesEngagements = keyof typeof PUCES_DES_ENGAGEMENTS;

/** `GET /api/commitments` : la projection de l'engagement, et son fil. */
export type LigneDEngagement = ProjectionEngagement & { readonly conversation: { readonly id: number; readonly title: string | null } };
export type PageDesEngagements = {
  readonly data: LigneDEngagement[];
  readonly meta?: { readonly counts?: { readonly owed?: number; readonly mine?: number; readonly late?: number } };
};

export const PAR_PAGE = 50;

/** La clé de la liste de l'onglet, par puce. */
export function engagementsQueryKey(puce: PuceDesEngagements) {
  return ['commitments', 'list', puce] as const;
}

/** Les paramètres de la requête : le filtre part au serveur, jamais sur une page reçue. `fields[…]` : la route n'en lit aucun. */
export function parametresDesEngagements(puce: PuceDesEngagements) {
  const filtre: Record<string, string> = { ...PUCES_DES_ENGAGEMENTS[puce] };
  return { ...(Object.keys(filtre).length > 0 ? { filter: filtre } : {}), per_page: PAR_PAGE };
}

type Groupe = 'retard' | 'aujourdhui' | 'semaine' | 'plusTard' | 'clos';

/** Le groupe d'une ligne, à l'heure de Dakar (UTC+0) : en retard, aujourd'hui, sous 7 jours, plus tard ; clos à part. */
export function groupeDe(e: Pick<ProjectionEngagement, 'etat' | 'due_at'>, maintenant: Date): Groupe {
  if (e.etat === 'kept' || e.etat === 'cancelled') return 'clos';
  if (e.etat === 'late') return 'retard';
  const due = e.due_at ? Date.parse(e.due_at) : Number.NaN;
  if (Number.isNaN(due)) return 'plusTard';
  if (due < maintenant.getTime()) return 'retard';
  if (new Date(due).toISOString().slice(0, 10) === maintenant.toISOString().slice(0, 10)) return 'aujourdhui';
  return due - maintenant.getTime() <= 7 * 86_400_000 ? 'semaine' : 'plusTard';
}

const ORDRE: readonly Groupe[] = ['retard', 'aujourdhui', 'semaine', 'plusTard', 'clos'];

/**
 * TCK-2973 (TCK-2987, maquette `fil-engagements` A, `liste`) — l'onglet « Engagements » de la messagerie :
 * ce qu'on doit au lecteur, les siens, les tenus, les annulés. Les puces partent au serveur
 * (`filter[role]`, `filter[etat]`) ; leurs comptes lisent `meta.counts`. Les lignes se groupent En retard
 * (encre d'alerte) · Aujourd'hui · Cette semaine · Plus tard. Une ligne ouvre son fil (`onOuvrir`).
 *
 * `forme="tableau"` (bureau, dans le panneau principal) : un tableau Qui s'engage · Engagement (et son
 * fil) · Échéance · Rattaché à · État, dans l'ordre que rend l'API (en retard, puis par échéance).
 */
export function EngagementsDeLaMessagerie({
  onOuvrir,
  dense = false,
  forme = 'liste',
}: {
  readonly onOuvrir: (conversationId: number) => void;
  readonly dense?: boolean;
  readonly forme?: 'liste' | 'tableau';
}) {
  const t = useTranslations('messaging.engagements.onglet');
  const tEtat = useTranslations('messaging.engagements.carte.etat');
  const f = useFormatteurs();
  const [puce, setPuce] = useState<PuceDesEngagements>('owed');
  const [maintenant] = useState(() => new Date());
  const { data, isLoading } = useApiQuery<PageDesEngagements>(engagementsQueryKey(puce), '/api/commitments', {
    params: parametresDesEngagements(puce),
  });
  const lignes = data?.data ?? [];
  const comptes = data?.meta?.counts;
  const groupes = ORDRE.map((g) => ({ g, lignes: lignes.filter((l) => groupeDe(l, maintenant) === g) })).filter((x) => x.lignes.length > 0);

  return (
    <div data-testid="engagements-de-la-messagerie">
      <RangeeDePuces aria-label={t('filtres')} className={cn('sticky top-0 z-10 bg-background', dense && 'pt-3')}>
        {(Object.keys(PUCES_DES_ENGAGEMENTS) as PuceDesEngagements[]).map((cle) => (
          <PuceDeFiltre
            key={cle}
            active={puce === cle}
            taille={dense ? 'sm' : 'default'}
            compte={cle === 'owed' ? comptes?.owed : cle === 'mine' ? comptes?.mine : undefined}
            onClick={() => setPuce(cle)}
          >
            {t(`puces.${cle}`)}
          </PuceDeFiltre>
        ))}
      </RangeeDePuces>
      {isLoading ? (
        <div className="space-y-3 p-4" aria-busy="true">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : groupes.length === 0 ? (
        <EmptyState variant="nue" data-testid="engagements-vide" title={t('vide')} description={t('videAide')} />
      ) : forme === 'tableau' ? (
        <TableauDesEngagements lignes={lignes} maintenant={maintenant} onOuvrir={onOuvrir} />
      ) : (
        groupes.map(({ g, lignes: ls }) => (
          <section key={g} data-testid={`groupe-${g}`}>
            <p className={cn('px-4 pt-3 pb-1 text-ui font-semibold', g === 'retard' ? 'text-destructive' : 'text-foreground/80')}>
              {t(`groupes.${g}`, { n: ls.length })}
            </p>
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {ls.map((l) => {
                const etat: EtatDEngagement = g === 'retard' ? 'late' : l.etat;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onOuvrir(l.conversation.id)}
                      className="flex w-full flex-col gap-0.5 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="flex items-start gap-2">
                        <span className={cn('min-w-0 flex-1 text-corps leading-snug font-medium', l.etat === 'cancelled' && 'text-muted-foreground line-through')}>
                          {l.title?.trim() || t('sansTitre')}
                        </span>
                        <span className={cn('flex-none text-xs font-medium', ENCRE_DE_L_ETAT[etat])}>{tEtat(etat)}</span>
                      </span>
                      <span className="text-ui text-muted-foreground">
                        {l.holder?.name ?? '—'}
                        {l.due_at ? ` · ${f.dateTime(l.due_at)}` : ''}
                      </span>
                      {l.conversation.title ? <span className="truncate text-ui text-muted-foreground">{t('depuisLeFil', { fil: l.conversation.title })}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/** Le type de l'objet rattaché, en mots (une clé du registre `SujetsDuFil`) ; inconnu : rien. */
const OBJETS_CONNUS = new Set(['maintenance_request', 'lease', 'booking', 'property', 'lease_payment', 'property_visit', 'inventory']);

/** TCK-2973 — le tableau du bureau (maquette `fil-engagements` A, `liste`, bureau). Une ligne ouvre son fil. */
function TableauDesEngagements({ lignes, maintenant, onOuvrir }: { readonly lignes: readonly LigneDEngagement[]; readonly maintenant: Date; readonly onOuvrir: (conversationId: number) => void }) {
  const t = useTranslations('messaging.engagements.onglet');
  const tEtat = useTranslations('messaging.engagements.carte.etat');
  const f = useFormatteurs();
  return (
    <div className="overflow-x-auto px-4 pb-4">
      <table data-testid="tableau-des-engagements" className="w-full min-w-[calc(var(--spacing)*160)] text-left text-ui">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 font-medium">{t('colonnes.qui')}</th>
            <th scope="col" className="py-2 pr-3 font-medium">{t('colonnes.engagement')}</th>
            <th scope="col" className="py-2 pr-3 font-medium">{t('colonnes.echeance')}</th>
            <th scope="col" className="py-2 pr-3 font-medium">{t('colonnes.rattache')}</th>
            <th scope="col" className="py-2 font-medium">{t('colonnes.etat')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {lignes.map((l) => {
            const etat: EtatDEngagement = groupeDe(l, maintenant) === 'retard' ? 'late' : l.etat;
            const barre = l.etat === 'cancelled' ? 'text-muted-foreground line-through' : undefined;
            const objet = l.object && OBJETS_CONNUS.has(l.object.type) ? t(`objets.${l.object.type}`) : '—';
            return (
              <tr key={l.id} className="cursor-pointer hover:bg-muted/60" onClick={() => onOuvrir(l.conversation.id)}>
                <td className="py-2.5 pr-3 font-medium">{l.holder?.name ?? '—'}</td>
                <td className="py-2.5 pr-3">
                  {/* le clic remonte à la ligne : un seul appel */}
                  <button type="button" className="text-left font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
                    <span className={barre}>{l.title?.trim() || t('sansTitre')}</span>
                  </button>
                  {l.conversation.title ? <span className="block text-xs text-muted-foreground">{t('depuisLeFil', { fil: l.conversation.title })}</span> : null}
                </td>
                <td className="py-2.5 pr-3 tabular-nums">{l.due_at ? f.dateTime(l.due_at) : '—'}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">{objet}</td>
                <td className={cn('py-2.5 font-medium', ENCRE_DE_L_ETAT[etat])}>{tEtat(etat)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
