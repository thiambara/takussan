'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ResumePublication } from './publication';

interface ConfirmerPublicationProps {
  readonly open: boolean;
  readonly nom: string | null;
  readonly resume: ResumePublication;
  readonly enCours: boolean;
  /** Le refus de l'API, déjà en libellé : le dialogue reste ouvert dessus, et le geste se réessaie. */
  readonly erreur: string | null;
  readonly onAnnuler: () => void;
  readonly onConfirmer: () => void;
}

/**
 * TCK-2389 — la confirmation explicite d'un geste lourd : ce qui sera créé au nom de quelqu'un, en une phrase
 * (« 1 compte, 1 espace, N biens publiés avec M photos »), et le seul bouton qui l'accomplit. Le dialogue ne se ferme pas
 * pendant l'envoi, et reste ouvert sur un refus : le même geste se réessaie sous la même clé d'idempotence.
 */
export function ConfirmerPublication({ open, nom, resume, enCours, erreur, onAnnuler, onConfirmer }: ConfirmerPublicationProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.confirm');

  return (
    <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert && !enCours) onAnnuler(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{nom ? t('title', { name: nom }) : t('titleUnnamed')}</DialogTitle>
          <DialogDescription>{t('body')}</DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground" data-testid="radar-publication-resume">
          {resume.creeLeCompte ? t('summaryNew', { biens: resume.biens, photos: resume.photos }) : t('summaryExisting', { biens: resume.biens, photos: resume.photos })}
        </p>
        {erreur ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-publication-confirm-erreur">
            {erreur}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={enCours} onClick={onAnnuler}>{t('cancel')}</Button>
          <Button type="button" disabled={enCours || resume.biens === 0} onClick={onConfirmer}>
            {enCours ? t('publishing') : t('publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
