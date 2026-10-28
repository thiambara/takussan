'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ApiError } from '@/lib/api';
import { radarKeys, setRadarListingAdvertiser } from '@/lib/queries/radar';
import type { RadarListingDetail, RadarListingDetailResponse } from '@/types/radar';
import { ErreurDialogue } from './DialoguesFiche';
import { peutChangerAnnonceur } from './gestes';
import type { CorrectionsFiche } from './useCorrectionsFiche';

interface RadarDroppedPhonesProps {
  readonly detail: RadarListingDetail;
  readonly corrections: CorrectionsFiche;
}

interface Cible {
  readonly phone: string;
  /** Lu par l'IA mais absent de la source (`phones_dropped`) : la confirmation le dit. */
  readonly ecarte: boolean;
}

/**
 * TCK-2387 (AC6) — les numéros de la fiche, en deux blocs qui ne se mélangent pas : ceux que l'annonce
 * porte (`phones`, retenus), et ceux que l'IA a lus sans que la source les porte (`phones_dropped`) — un
 * tel numéro peut être halluciné, donc celui d'un inconnu : l'avertissement le dit.
 *
 * « En faire l'annonceur » demande confirmation, envoie d'abord les corrections en attente, puis
 * `PUT advertiser {phone}`. Si la réponse passe l'annonce en `do_not_contact` (un STOP dit pour ce numéro),
 * la fiche le dit : l'étape ne permet plus aucun geste, et les boutons le suivent.
 */
export function RadarDroppedPhones({ detail, corrections }: RadarDroppedPhonesProps) {
  const t = useTranslations('superAdmin.pages.radar.listing.phones');
  const tFiche = useTranslations('superAdmin.pages.radar.listing');
  const queryClient = useQueryClient();
  const [cible, setCible] = useState<Cible | null>(null);
  const [rattache, setRattache] = useState(false);

  const mutation = useMutation<RadarListingDetailResponse, ApiError, string>({
    mutationFn: (phone) => setRadarListingAdvertiser(detail.id, phone),
    onSuccess: (reponse) => {
      queryClient.setQueryData(radarKeys.detail(detail.id), reponse);
      void queryClient.invalidateQueries({ queryKey: radarKeys.all });
      setRattache(reponse.data.stage !== 'do_not_contact');
      setCible(null);
    },
  });

  const retenus = detail.extracted?.phones ?? [];
  const ecartes = (detail.extracted?.phones_dropped ?? []).filter((phone) => !retenus.includes(phone));
  const permis = peutChangerAnnonceur(detail.stage);
  const courant = detail.advertiser?.phone ?? null;

  const confirmer = async () => {
    if (!cible || mutation.isPending) return;
    if (!(await corrections.enregistrer())) return;
    mutation.mutate(cible.phone);
  };

  const ligne = (phone: string, ecarte: boolean) => (
    <li key={phone} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm">
      <span className="font-mono text-foreground">{phone}</span>
      {phone === courant ? (
        <span className="text-xs font-medium text-muted-foreground">{t('currentAdvertiser')}</span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!permis}
          aria-label={t('makeAdvertiserFor', { phone })}
          onClick={() => {
            // Une erreur d'un enregistrement antérieur ne s'affiche pas dans la confirmation qui s'ouvre.
            corrections.effacerErreur();
            mutation.reset();
            setRattache(false);
            setCible({ phone, ecarte });
          }}
        >
          {t('makeAdvertiser')}
        </Button>
      )}
    </li>
  );

  return (
    <section aria-label={t('heading')} className="space-y-3" data-testid="radar-phones">
      <h3 className="text-sm font-semibold text-foreground">{t('heading')}</h3>

      {detail.stage === 'do_not_contact' ? (
        <p role="status" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="radar-do-not-contact">
          {t('doNotContact')}
        </p>
      ) : rattache ? (
        <p role="status" className="text-sm text-muted-foreground">{t('attached')}</p>
      ) : null}

      {detail.advertiser ? (
        <Link
          href={`/super-admin/radar/advertisers/${detail.advertiser.id}`}
          className="inline-block rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          data-testid="radar-advertiser-link"
        >
          {t('openAdvertiser')}
        </Link>
      ) : null}

      <div role="group" aria-label={t('kept')} className="space-y-1.5" data-testid="radar-phones-kept">
        <p className="text-xs font-medium text-muted-foreground">{t('kept')}</p>
        {retenus.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('keptNone')}</p>
        ) : (
          <ul className="space-y-1.5">{retenus.map((phone) => ligne(phone, false))}</ul>
        )}
      </div>

      {ecartes.length > 0 ? (
        <div role="group" aria-label={t('dropped')} className="space-y-1.5 rounded-lg border border-warning/60 bg-warning/5 p-3" data-testid="radar-phones-dropped">
          <p className="text-xs font-medium text-foreground">{t('dropped')}</p>
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {t('droppedWarning')}
          </p>
          <ul className="space-y-1.5">{ecartes.map((phone) => ligne(phone, true))}</ul>
        </div>
      ) : null}

      <Dialog open={cible !== null} onOpenChange={(ouvert) => { if (!ouvert) setCible(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>
              {cible?.ecarte ? t('confirmDropped', { phone: cible.phone }) : t('confirmKept', { phone: cible?.phone ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <ErreurDialogue erreur={corrections.erreur ?? mutation.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCible(null)}>
              {tFiche('dialogs.cancel')}
            </Button>
            <Button type="button" disabled={mutation.isPending || corrections.enCours} onClick={() => void confirmer()}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
