'use client';

import { useId } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { History, Phone } from 'lucide-react';

import { StatusBadge } from '@/components/console/StatusBadge';
import { isReachable, telHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { AvatarDuPayeur } from '../argent/LigneDEncaissement';
import { useNoterLaRelance } from './useNoterLaRelance';
import { useLectureDImpaye } from './lecture';
import { RETARD_GRAVE } from './tranches';
import { CLASSE_JAMAIS_EN_ALERTE, useJamaisRelanceEnAlerte } from './ton-de-la-relance';

/** Le geste d'une carte : 44 px au moins (AC4), pleine largeur partagée. */
const GESTE = 'h-11 min-h-11 text-corps font-semibold';

/**
 * TCK-2660 — un impayé au téléphone (maquette `CarteImpaye`) : le locataire et le bien, le reste dû
 * et le retard, puis « période · dernière relance · bailleur », et deux gestes pleine largeur.
 * Une carte par ÉCHÉANCE (décision 2 a) : chacune a son lien de paiement et sa relance.
 *
 * Sans numéro joignable, « Relancer sur WhatsApp » et « Appeler » sont désactivés, et la phrase qui
 * dit pourquoi est nommée par `aria-describedby` (AC6), avec le lien vers la fiche client.
 *
 * TCK-2682 — en mode sélection, une case devant l'avatar, dans une cible de 44 px (le `<label>` qui
 * l'enveloppe) ; la carte cochée prend le fond de la sélection.
 *
 * TCK-2792 — le nom est un lien ÉTIRÉ sur la tête de la carte (avatar, bien, reste dû, retard), comme celui
 * des cartes de baux et de clients : sa zone de frappe est la tête (40 px et plus), pas la ligne de texte
 * (18,8 px). La case, dans la tête, reste au-dessus (`relative z-10`) ; les deux gestes sont hors de la tête.
 */
export function CarteDImpaye({
  row,
  onRelancer,
  selection,
}: {
  readonly row: PaymentHistoryRow;
  readonly onRelancer: (row: PaymentHistoryRow) => void;
  readonly selection?: { readonly cochee: boolean; readonly onCocher: (cochee: boolean) => void };
}) {
  const t = useTranslations('admin.finances.impayes');
  const l = useLectureDImpaye();
  const noter = useNoterLaRelance();
  const raisonId = useId();
  const nom = l.nom(row);
  const bien = l.bien(row);
  const retard = row.days_late ?? 0;
  const telephone = row.payer?.phone ?? null;
  const joignable = isReachable(telephone);
  const fiche = row.payer?.id ? `/app/customers/${row.payer.id}` : null;
  const meta = [l.periode(row), l.relance(row), row.landlord?.name ?? null].filter(Boolean).join(' · ');
  // TCK-2629 — « jamais relancé » en ton d'alerte quand le montage le demande (Rapports).
  const jamaisEnAlerte = useJamaisRelanceEnAlerte() && !row.last_reminder;

  return (
    <article
      data-slot="carte-impaye"
      data-cochee={selection?.cochee ? '' : undefined}
      aria-label={nom}
      className={cn('rounded-xl border border-border bg-card p-4', selection?.cochee && 'border-primary/40 bg-primary/5')}
    >
      <div className="relative flex items-start gap-3">
        {selection && row.source === 'lease' ? (
          <label className="relative z-10 -my-0.5 -mr-1 -ml-2.5 flex size-11 flex-none cursor-pointer items-center justify-center" data-slot="coche-impaye">
            <Checkbox
              checked={selection.cochee}
              onCheckedChange={(c) => selection.onCocher(c === true)}
              aria-label={t('lot.cocher', { nom })}
            />
          </label>
        ) : null}
        <AvatarDuPayeur nom={nom} />
        <div className="min-w-0 flex-1">
          {fiche ? (
            <Link
              href={fiche}
              className="block truncate text-corps font-semibold leading-tight outline-none after:absolute after:inset-0 hover:underline focus-visible:underline"
            >
              {nom}
            </Link>
          ) : (
            <p className="truncate text-corps font-semibold leading-tight">{nom}</p>
          )}
          <p className="mt-0.5 truncate text-ui leading-normal text-muted-foreground">{bien ?? '—'}</p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <p className="text-corps font-semibold leading-tight tabular-nums">{l.montantDu(row)}</p>
          <StatusBadge
            tone={retard > RETARD_GRAVE ? 'danger' : 'attention'}
            label={t('carte.retard', { count: retard })}
            className="h-5 px-1.5 text-legende portee-app:h-5"
          />
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-ui leading-normal text-muted-foreground">
        <History className="size-3.5 flex-none" aria-hidden="true" />
        <span className="truncate" data-slot="meta-impaye">
          {jamaisEnAlerte ? (
            <>
              {l.periode(row) ? `${l.periode(row)} · ` : null}
              <span className={CLASSE_JAMAIS_EN_ALERTE} data-slot="jamais-relance">
                {l.relance(row)}
              </span>
              {row.landlord?.name ? ` · ${row.landlord.name}` : null}
            </>
          ) : (
            meta
          )}
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          disabled={!joignable}
          aria-describedby={joignable ? undefined : raisonId}
          onClick={() => onRelancer(row)}
          className={cn(GESTE, 'min-w-0 flex-1 gap-2 border-transparent bg-success/10 text-success hover:bg-success/15')}
        >
          <IconeWhatsApp className="size-4.5" />
          {t('gestes.relancerWhatsApp')}
        </Button>
        {joignable ? (
          <a
            href={telHref(telephone)}
            onClick={() => noter.mutate({ paymentId: row.id, channel: 'call' })}
            className={cn(buttonVariants({ variant: 'outline' }), GESTE, 'flex-none gap-2 px-3.5')}
          >
            <Phone className="size-4" aria-hidden="true" />
            {t('gestes.appeler')}
          </a>
        ) : (
          <Button type="button" variant="outline" disabled aria-describedby={raisonId} className={cn(GESTE, 'flex-none gap-2 px-3.5')}>
            <Phone className="size-4" aria-hidden="true" />
            {t('gestes.appeler')}
          </Button>
        )}
      </div>
      {joignable ? null : (
        <p className="mt-2 text-ui text-muted-foreground">
          <span id={raisonId}>{t('sansTelephone')}</span>
          {fiche ? (
            <>
              {' · '}
              <Link href={fiche} className="font-medium text-primary underline-offset-2 hover:underline">
                {t('gestes.ficheClient')}
              </Link>
            </>
          ) : null}
        </p>
      )}
    </article>
  );
}
