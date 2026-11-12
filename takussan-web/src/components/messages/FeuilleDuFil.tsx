'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, BellOff, Building2, ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { PropertyStatusBadge } from '@/components/property-dashboard/PropertyStatusBadge';
import { enumLabel } from '@/components/customer-form/options';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, whatsappHref } from '@/components/crm/contact';
import { useAuth } from '@/context/AuthContext';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { pipelineStageValues } from '@/lib/enums/customer';
import { formatMontant } from '@/lib/format/currency';
import { formaterTelephone } from '@/lib/phone';
import { useConversation, useConversationContext, useToggleMute } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';
import { titreDeConversation } from './ConversationList';
import { useGesteDuClient } from './useGesteDuClient';

interface FeuilleDuFilProps {
  readonly conversationId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const RANGEE =
  'flex min-h-14 w-full items-center gap-3 py-2.5 text-left text-corps outline-none focus-visible:ring-3 focus-visible:ring-ring';

/**
 * TCK-2632 — « ⋯ » d'un fil direct au téléphone (maquette `app-messagerie` a/2) : une feuille du bas
 * au nom de la personne, qui porte ce que la colonne de contexte porte au bureau — le bien, la fiche
 * du client, WhatsApp — et la sourdine.
 *
 * **Elle ne montre que ce que `GET /api/conversations/{id}/context` rend** (TCK-2630) : la fiche du
 * client et son numéro n'existent que pour le personnel de l'agence du fil ; un client, un bailleur,
 * un prestataire n'y voient que le bien et la sourdine.
 *
 * « Planifier une visite » ouvre `PlanifierDialog` (TCK-590) avec le bien et la fiche du fil : seulement
 * quand le contexte rend les deux — la fiche n'est rendue qu'au personnel de l'agence du fil — et pour
 * un profil actif du personnel (`usePersonnelActif`, la garde de `PlanifierUneVisite`).
 *
 * Écarts à la maquette, faute de route ou de donnée : la demande de contact liée et « Signaler la
 * conversation » — non rendus plutôt qu'inventés.
 *
 * Importée par la seule page de la messagerie, jamais par l'en-tête du fil : le widget flottant
 * importe celui-ci, et les dictionnaires du bien et du pipeline entreraient sinon dans la coque.
 */
export function FeuilleDuFil({ conversationId, open, onOpenChange }: FeuilleDuFilProps) {
  const t = useTranslations('messaging');
  const tEtape = useTranslations('crm.pipeline.stage');
  const { user } = useAuth();
  const { data: conversationData } = useConversation(conversationId);
  const { data: contexteData } = useConversationContext(conversationId);
  const basculerSourdine = useToggleMute(conversationId);
  const { consigner, enCours } = useGesteDuClient();
  const personnel = usePersonnelActif();
  const [planifier, setPlanifier] = useState(false);
  const messageErreur = useMessageErreurApi();
  /** L'échec d'un geste de la feuille, dit en tête de la feuille (P228.06 : aucune mutation muette). */
  const [erreur, setErreur] = useState<string | null>(null);
  /** Fermer efface la phrase : rouverte, la feuille ne dit pas un échec périmé. */
  const changerOuverture = (ouverte: boolean) => {
    if (!ouverte) setErreur(null);
    onOpenChange(ouverte);
  };
  const fermer = () => changerOuverture(false);

  const conversation = conversationData?.data;
  const titre = conversation
    ? titreDeConversation(conversation, user?.id, t('conversationTitleFallback', { id: String(conversationId) }))
    : t('conversationTitleFallback', { id: String(conversationId) });
  const sourdine = Boolean(conversation?.participants?.find((p) => p.user_id === user?.id && !p.left_at)?.is_muted);
  const bien = contexteData?.data?.property ?? null;
  const client = contexteData?.data?.customer ?? null;
  const telephone = client && isReachable(client.phone) ? client.phone : null;
  const peutPlanifier = personnel && bien !== null && client != null;
  const etape = client?.stage ? enumLabel(tEtape, pipelineStageValues, client.stage) : null;

  return (
    <>
      <FeuilleDuBas
        open={open}
        onOpenChange={changerOuverture}
        titre={titre}
        pied={
          peutPlanifier ? (
            <Button
              type="button"
              size="xl"
              className="w-full"
              onClick={() => {
                fermer();
                setPlanifier(true);
              }}
            >
              {t('contexte.planifier')}
            </Button>
          ) : undefined
        }
      >
        {erreur ? (
          <p role="alert" data-testid="erreur-de-la-feuille" className="mt-2 text-ui text-destructive">
            {erreur}
          </p>
        ) : null}
        {bien ? (
          <Link
            href={`/properties/${bien.slug}`}
            data-testid="feuille-du-fil-bien"
            className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-background p-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <span className="relative block size-18 flex-none overflow-hidden rounded-lg bg-muted">
              {bien.cover_url ? (
                <Image src={bien.cover_url} alt="" fill sizes="72px" className="object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              {bien.price !== null ? (
                <span className="block font-display text-lg font-semibold tabular-nums tracking-titre">
                  {formatMontant(bien.price)}
                </span>
              ) : null}
              <span className="block truncate text-sm text-muted-foreground">{bien.title}</span>
              <span className="mt-1 flex items-center gap-2">
                <PropertyStatusBadge status={bien.status} />
                {bien.reference_number ? (
                  <span className="truncate text-ui text-muted-foreground">{bien.reference_number}</span>
                ) : null}
              </span>
            </span>
          </Link>
        ) : null}

        <div className="mt-2 divide-y divide-border/70">
          {client ? (
            <Link href={`/app/customers/${client.id}`} className={RANGEE}>
              <Users className="size-5 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t('contexte.ficheDuClient')}</span>
                {client.full_name ? (
                  <span className="block truncate text-ui text-muted-foreground">
                    {etape
                      ? t('contexte.nomEtEtape', {
                          nom: client.full_name,
                          etape,
                        })
                      : client.full_name}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
            </Link>
          ) : null}
          {telephone ? (
            <a
              href={whatsappHref(telephone, '')}
              target="_blank"
              rel="noopener noreferrer"
              // Réserve de TCK-2632 : la feuille reste ouverte le temps du geste — un second appui est
              // ignoré (ni second contact noté, ni second onglet) tant qu'il est en cours.
              aria-disabled={enCours || undefined}
              onClick={(e) => {
                // L'échec se dit DANS la feuille : elle ne se ferme donc qu'une fois le geste noté,
                // et reste ouverte sur la phrase s'il ne l'est pas (P228.06 — vérification de TCK-2632).
                if (!client) return;
                consigner(
                  e,
                  { id: client.id, channel: 'whatsapp' },
                  { onDepart: () => setErreur(null), onSuccess: () => fermer(), onError: () => setErreur(t('chat.gesteNonConsigne')) },
                );
              }}
              className={cn(RANGEE, 'aria-disabled:opacity-60')}
            >
              <IconeWhatsApp className="size-5 flex-none" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t('chat.whatsapp')}</span>
                <span className="block text-ui tabular-nums text-muted-foreground">{formaterTelephone(telephone)}</span>
              </span>
              <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setErreur(null);
              basculerSourdine.mutate(
                { is_muted: !sourdine },
                { onError: (err) => setErreur(messageErreur(err, t('chat.sourdineEchouee'))) },
              );
            }}
            className={RANGEE}
          >
            {sourdine ? (
              <Bell className="size-5 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
            ) : (
              <BellOff className="size-5 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 font-medium">{sourdine ? t('group.info.unmute') : t('group.info.mute')}</span>
            <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
      </FeuilleDuBas>
      {planifier && bien && client ? (
        <PlanifierDialog
          property={{
            id: bien.id,
            libelle: bien.title,
            photo: bien.cover_url,
            detail: bien.reference_number,
          }}
          customer={{
            id: client.id,
            libelle: client.full_name ?? '',
            telephone: client.phone,
            etape: client.stage,
          }}
          onClose={() => setPlanifier(false)}
        />
      ) : null}
    </>
  );
}
