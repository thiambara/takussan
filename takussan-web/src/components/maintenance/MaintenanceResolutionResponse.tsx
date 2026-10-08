'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  useConfirmMaintenanceResolution,
  useContestMaintenanceResolution,
} from '@/lib/queries/maintenance';
import { reduirePhotos } from '@/lib/reduire-photo';
import type { MaintenanceRequest } from '@/types/maintenance';

/** Les bornes de `ContestMaintenanceResolutionRequest`. */
const COMMENT_MIN = 3;
const PHOTOS_MAX = 5;

/**
 * TCK-592 (P10) — la clôture contradictoire, côté demandeur : « C'est réparé » clôt, « Le problème
 * persiste » renvoie l'intervention au prestataire avec un commentaire et des photos. Sans
 * réponse, la demande se clôt d'elle-même au bout de sept jours (`maintenance:auto-close`).
 */
export function MaintenanceResolutionResponse({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.intervention.resolution');
  const messageErreur = useMessageErreurApi();
  const confirm = useConfirmMaintenanceResolution(request.id);
  const contest = useContestMaintenanceResolution(request.id);
  const [contesting, setContesting] = useState(false);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);

  const canConfirm = request.abilities?.can_confirm_resolution === true;
  const canContest = request.abilities?.can_contest_resolution === true;
  if (!canConfirm && !canContest) return null;

  const error = confirm.error ?? contest.error;
  const pending = confirm.isPending || contest.isPending;

  const sendContest = async () => {
    await contest.mutateAsync({
      comment: comment.trim(),
      photos: photos.length > 0 ? await reduirePhotos(photos.slice(0, PHOTOS_MAX)) : undefined,
    });
    setContesting(false);
    setComment('');
    setPhotos([]);
  };

  return (
    <section className="rounded-xl border border-success/20 bg-success/5 p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('body')}</p>

      {contesting ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim().length < COMMENT_MIN) return;
            void sendContest().catch(() => undefined);
          }}
        >
          <label htmlFor="contest-comment" className="block text-sm font-medium">
            {t('comment_label')}
          </label>
          <Textarea
            id="contest-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={t('comment_placeholder')}
          />
          <label htmlFor="contest-photos" className="block text-sm font-medium">
            {t('photos_label')}
          </label>
          <input
            id="contest-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted sm:file:h-8"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="h-11 sm:h-9"
              disabled={pending || comment.trim().length < COMMENT_MIN}
            >
              {t('send_contest')}
            </Button>
            <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => setContesting(false)}>
              {t('back')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {canConfirm ? (
            <Button type="button" className="h-11 sm:h-9" disabled={pending} onClick={() => confirm.mutate()}>
              {t('confirm')}
            </Button>
          ) : null}
          {canContest ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              disabled={pending}
              onClick={() => setContesting(true)}
            >
              {t('contest')}
            </Button>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageErreur(error, t('failed'))}
        </p>
      ) : null}
    </section>
  );
}
