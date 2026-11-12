'use client';

import Image from 'next/image';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Building2, ChevronRight, FileText, Wrench } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/console';
import { PropertyStatusBadge } from '@/components/property-dashboard/PropertyStatusBadge';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { PIPELINE_STAGE_TONE, enumLabel } from '@/components/customer-form/options';
import { pipelineStageValues } from '@/lib/enums/customer';
import { formatMontant } from '@/lib/format/currency';
import { formaterTelephone } from '@/lib/phone';
import { initiales } from '@/lib/fiche-publique';
import { useConversationContext } from '@/lib/queries/conversations';
import { lireTable } from '@/lib/table-de-statut';
import { cn } from '@/lib/utils';
import type { ConversationContext } from '@/types/message';
import { ID_COLONNE_DE_CONTEXTE } from './EnTeteDuFil';


interface ColonneDeContexteProps {
  readonly conversationId: number;
  readonly ouverte: boolean;
  readonly onOuvrir: () => void;
}

/**
 * TCK-2632 — la colonne de contexte du bureau (maquette `app-messagerie`, `ColonneContexte` et
 * `ColonneRepliee`) : ce que WhatsApp n'a pas — le bien, la fiche du client, le bail ou
 * l'intervention. Dès `xl` seulement ; sous `xl`, le fil garde la largeur.
 *
 * **Elle ne montre que ce que `GET /api/conversations/{id}/context` rend** (TCK-2630), chaque bloc
 * jugé seul par l'API. La fiche du client n'existe que pour le personnel de l'agence du fil (clé
 * absente pour les autres) ; un client, un bailleur, un prestataire n'en voient rien.
 *
 * « Planifier une visite » ouvre `PlanifierDialog` (TCK-590), le bien et la fiche du fil posés : quand
 * le contexte rend les deux, pour un profil actif du personnel (la garde de `PlanifierUneVisite`).
 *
 * Écarts à la maquette, faute de donnée (AC-F3) : « Projet », « Dernière visite », « Premier
 * contact » et la demande de contact liée n'ont rien derrière eux dans le contexte du fil — non
 * rendus plutôt qu'inventés.
 *
 * Repliée, elle devient un rail de vignettes, qui est tout entier le bouton qui la rouvre.
 */
export function ColonneDeContexte({ conversationId, ouverte, onOuvrir }: ColonneDeContexteProps) {
  const t = useTranslations('messaging.contexte');
  const { data, isLoading } = useConversationContext(conversationId);
  const contexte = data?.data ?? null;

  if (!ouverte) {
    return (
      <aside
        id={ID_COLONNE_DE_CONTEXTE}
        data-testid="colonne-de-contexte"
        data-etat="repliee"
        className="flex w-[calc(var(--spacing)*15.6)] flex-none flex-col items-center border-l border-border bg-background py-4 max-xl:hidden"
      >
        <button
          type="button"
          onClick={onOuvrir}
          aria-label={t('afficher')}
          className="flex flex-col items-center gap-2 rounded-lg p-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        >
          {contexte?.property ? <VignetteDuBien bien={contexte.property} taille="rail" /> : null}
          {contexte?.customer?.full_name ? (
            <Avatar size="36">
              <AvatarFallback>{initiales(contexte.customer.full_name)}</AvatarFallback>
            </Avatar>
          ) : null}
          {contexte?.lease ? (
            <FileText className="size-4.5 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
          ) : contexte?.maintenance ? (
            <Wrench className="size-4.5 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
          ) : null}
        </button>
      </aside>
    );
  }

  return (
    <aside
      id={ID_COLONNE_DE_CONTEXTE}
      data-testid="colonne-de-contexte"
      data-etat="ouverte"
      aria-label={t('titre')}
      className="flex w-[min(calc(var(--spacing)*88.9),29.6%)] flex-none flex-col overflow-y-auto border-l border-border bg-background max-xl:hidden"
    >
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="aspect-[16/9] w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : contexte ? (
          <ContenuDuContexte contexte={contexte} />
        ) : null}
      </div>
    </aside>
  );
}

function ContenuDuContexte({ contexte }: { readonly contexte: ConversationContext }) {
  const t = useTranslations('messaging.contexte');
  const tEtape = useTranslations('crm.pipeline.stage');
  const tBail = useTranslations('lease.status');
  const tIntervention = useTranslations('maintenance.status');
  const { property: bien, customer: client, lease: bail, maintenance: intervention } = contexte;
  const personnel = usePersonnelActif();
  const [planifier, setPlanifier] = useState(false);

  return (
    <>
      {bien ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="contexte-bien">
          <VignetteDuBien bien={bien} taille="carte" />
          <div className="p-3.5">
            <div className="flex items-center gap-2">
              {bien.price !== null ? (
                <p className="min-w-0 flex-1 font-display text-lg font-semibold tabular-nums tracking-titre">
                  {formatMontant(bien.price)}
                </p>
              ) : (
                <span className="flex-1" />
              )}
              <PropertyStatusBadge status={bien.status} />
            </div>
            <Link
              href={`/properties/${bien.slug}`}
              className="mt-0.5 block truncate text-sm underline-offset-2 hover:underline focus-visible:underline"
            >
              {bien.title}
            </Link>
            {bien.reference_number ? (
              <p className="truncate text-ui text-muted-foreground">{bien.reference_number}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {client ? (
        <>
          <p className="mt-5 mb-1 text-xs font-medium text-muted-foreground">{t('client')}</p>
          <div className="rounded-xl border border-border bg-card px-3.5 py-2" data-testid="contexte-client">
            <div className="flex items-center gap-2.5 border-b border-border/70 py-2">
              <Avatar size="32">
                <AvatarFallback>{client.full_name ? initiales(client.full_name) : null}</AvatarFallback>
              </Avatar>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{client.full_name}</p>
              {client.stage ? (
                <StatusBadge
                  label={enumLabel(tEtape, pipelineStageValues, client.stage)}
                  tone={lireTable(PIPELINE_STAGE_TONE, client.stage) ?? 'neutral'}
                />
              ) : null}
            </div>
            {client.phone ? <LigneDeContexte libelle={t('telephone')}>{formaterTelephone(client.phone)}</LigneDeContexte> : null}
            {client.assigned_agent ? (
              <LigneDeContexte libelle={t('agent')}>{client.assigned_agent.name}</LigneDeContexte>
            ) : null}
          </div>
        </>
      ) : null}

      <p className="mt-5 mb-1 text-xs font-medium text-muted-foreground">{t('lie')}</p>
      <div className="divide-y divide-border/70 rounded-xl border border-border bg-card px-3.5 text-ui" data-testid="contexte-lie">
        {bail ? (
          <Link
            href={`/app/leases/${bail.id}`}
            className="flex items-center gap-2.5 py-2.5 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
          >
            <FileText className="size-4 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{t('voirLeBail')}</span>
              <span className="block truncate text-muted-foreground">
                {[bail.reference, bail.tenant_name, bail.status ? (tBail.has(bail.status) ? tBail(bail.status) : bail.status) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
          </Link>
        ) : null}
        {intervention ? (
          <Link
            href={`/app/maintenance/${intervention.id}`}
            className="flex items-center gap-2.5 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Wrench className="size-4 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{intervention.title ?? t('intervention')}</span>
              {intervention.status ? (
                <span className="block truncate text-muted-foreground">
                  {tIntervention.has(intervention.status) ? tIntervention(intervention.status) : intervention.status}
                </span>
              ) : null}
            </span>
            <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
          </Link>
        ) : null}
        {!bail && !intervention ? <p className="py-2.5 text-muted-foreground">{t('rienDeLie')}</p> : null}
      </div>

      {client ? (
        <div className="mt-5 grid gap-2">
          {personnel && bien ? (
            <Button type="button" className="w-full" onClick={() => setPlanifier(true)}>
              {t('planifier')}
            </Button>
          ) : null}
          <Link href={`/app/customers/${client.id}`} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
            {t('voirLaFiche')}
          </Link>
        </div>
      ) : null}
      {planifier && bien && client ? (
        <PlanifierDialog
          property={{ id: bien.id, libelle: bien.title, photo: bien.cover_url, detail: bien.reference_number }}
          customer={{ id: client.id, libelle: client.full_name ?? '', telephone: client.phone, etape: client.stage }}
          onClose={() => setPlanifier(false)}
        />
      ) : null}
    </>
  );
}

function LigneDeContexte({ libelle, children }: { readonly libelle: string; readonly children: React.ReactNode }) {
  return (
    <p className="flex items-baseline justify-between gap-3 py-1.5 text-ui">
      <span className="flex-none text-muted-foreground">{libelle}</span>
      {/* Au bureau 1280, la valeur passe à la ligne plutôt que d'être coupée (maquette). */}
      <span className="min-w-0 text-right font-medium tabular-nums">{children}</span>
    </p>
  );
}

function VignetteDuBien({
  bien,
  taille,
}: {
  readonly bien: NonNullable<ConversationContext['property']>;
  readonly taille: 'carte' | 'rail';
}) {
  const classe = taille === 'carte' ? 'relative block aspect-[16/9] w-full bg-muted' : 'relative block size-9 overflow-hidden rounded-lg bg-muted';
  return (
    <span className={classe}>
      {bien.cover_url ? (
        <Image src={bien.cover_url} alt="" fill sizes={taille === 'carte' ? '320px' : '36px'} className="object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Building2 className="size-5" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
