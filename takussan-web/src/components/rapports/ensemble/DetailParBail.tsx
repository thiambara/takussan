'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useDetailParBail, type CommissionEntry } from '@/lib/queries/commissions';
import { cn } from '@/lib/utils';

/**
 * TCK-2867 (maquette `app-rapports` e7, « Détail par bail ») — ce que chaque bail rapporte à l'agent : au téléphone
 * une liste (le bien, « client · signé le 9 nov. », la commission et « Versée / À venir ») ; au bureau un tableau
 * Bail · Client · Signé le · Loyer mensuel · Commission · Versement, qui garde sa largeur et défile dans sa carte.
 *
 * UNE implémentation pour la vue d'ensemble et l'onglet « Commissions » : la même lecture du grand livre
 * (`useDetailParBail`, `include=lease.property,lease.tenant`), les lignes les plus récentes. Sous « Moi », celles de
 * l'agent (`filter[beneficiary_id]`) ; sous « Agence », celles que l'API lui sert (le grand livre de l'agence).
 *
 * Le versement dit ce que le grand livre sait : « Versée le … » (`paid_at`), « À venir » (due), « Annulée ». Aucun
 * mois de versement n'est deviné.
 */
export function DetailParBail({
  agence,
  lignes,
  lien,
}: {
  /** La portée « Agence » de l'agent : pas de filtre par bénéficiaire. */
  readonly agence: boolean;
  /** Combien de lignes lire : les plus récentes. */
  readonly lignes: number;
  /** Le lien du titre (« Onglet Commissions », « Tout le relevé »). */
  readonly lien: { readonly href: string; readonly libelle: string };
}) {
  const t = useTranslations('rapports.detailParBail');
  const f = useFormatteurs();
  const { user } = useAuth();
  const beneficiaire = agence ? undefined : user?.id;
  const lecture = useDetailParBail({ beneficiaryId: beneficiaire, perPage: lignes, enabled: agence || typeof beneficiaire === 'number' });
  const entrees = lecture.data?.data ?? [];

  const bien = (e: CommissionEntry) => e.lease?.property?.title ?? e.lease?.reference_number ?? t('bailSansNom');
  const client = (e: CommissionEntry) => e.lease?.tenant?.name || t('sansClient');
  const signe = (e: CommissionEntry) => f.jourMois(e.lease?.signed_at ?? e.earned_at);
  const loyer = (e: CommissionEntry) => (typeof e.lease?.monthly_rent === 'number' ? f.montantCourt(e.lease.monthly_rent, e.lease.currency ?? e.currency) : '—');
  const commission = (e: CommissionEntry) => f.montantCourt(e.amount, e.currency);
  const versement = (e: CommissionEntry, court: boolean): { readonly texte: string; readonly ton: 'succes' | 'neutre' | 'annule' } =>
    e.status === 'paid'
      ? { texte: court ? t('versee') : t('verseeLe', { date: f.jourMois(e.paid_at) }), ton: 'succes' }
      : e.status === 'cancelled'
        ? { texte: t('annulee'), ton: 'annule' }
        : { texte: t('aVenir'), ton: 'neutre' };

  return (
    <section aria-labelledby="detail-par-bail-titre" data-slot="detail-par-bail">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id="detail-par-bail-titre" className="text-corps font-semibold">
          {t('titre')}
        </h2>
        <Link
          href={lien.href}
          className="inline-flex min-h-11 items-center gap-0.5 rounded-sm text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {lien.libelle}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {lecture.isPending ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
      ) : lecture.isError ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t('erreur')}</p>
      ) : entrees.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t('vide')}</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card lg:hidden" data-slot="detail-par-bail-liste">
            {entrees.map((e) => {
              const v = versement(e, true);
              return (
                <li key={e.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-corps font-medium">{bien(e)}</p>
                    <p className="mt-0.5 truncate text-ui text-muted-foreground">{t('clientSigne', { client: client(e), date: signe(e) })}</p>
                  </div>
                  <div className="flex-none text-right leading-tight">
                    <p className="text-corps font-semibold tabular-nums">{commission(e)}</p>
                    <p className={cn('mt-0.5 text-xs', v.ton === 'succes' ? 'text-success' : 'text-muted-foreground', v.ton === 'annule' && 'line-through')}>{v.texte}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="overflow-x-auto rounded-xl border border-border bg-card max-lg:hidden" data-slot="detail-par-bail-tableau">
            {/* Largeurs de la maquette (`gabarit` : bail et client souples, dates, montants et statut fixes). */}
            <table className="w-full min-w-[59.25rem] table-fixed text-sm">
              <caption className="sr-only">{t('titre')}</caption>
              <colgroup>
                <col />
                <col className="w-[30%]" />
                <col className="w-28" />
                <col className="w-36" />
                <col className="w-36" />
                <col className="w-44" />
              </colgroup>
              <thead className="bg-muted/40 text-ui text-muted-foreground">
                <tr>
                  {(['bail', 'client', 'signeLe', 'loyer', 'commission', 'versement'] as const).map((c) => (
                    <th key={c} scope="col" className={cn('whitespace-nowrap px-4 py-2.5 font-medium', c === 'loyer' || c === 'commission' ? 'text-right' : 'text-left')}>
                      {t(`colonnes.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entrees.map((e) => {
                  const v = versement(e, false);
                  return (
                    <tr key={e.id}>
                      <th scope="row" className="truncate px-4 py-3 text-left font-medium">
                        {bien(e)}
                      </th>
                      <td className="truncate px-4 py-3 text-foreground">{client(e)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground">{signe(e)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{loyer(e)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{commission(e)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          data-ton={v.ton}
                          className={cn(
                            'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium',
                            v.ton === 'succes' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {v.texte}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
