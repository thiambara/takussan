'use client';

import { useState } from 'react';
import { Check, Copy, Share2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cheminDeSelection, SELECTION_PARTAGEE_MAX } from '@/lib/favoris-suivi';
import { copyToClipboard } from '@/lib/share';
import { cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';

export interface PartageDeSelectionProps {
  /** Les biens DISPONIBLES de la sélection, plus récent d'abord. Seuls leurs identifiants partent. */
  readonly biens: readonly PropertyListItem[];
  /** `bureau` : le bouton plein de l'en-tête large ; `telephone` : la pastille de l'en-tête. */
  readonly variante?: 'telephone' | 'bureau';
  readonly className?: string;
}

/**
 * TCK-2508 — « Partager ma sélection » : un lien `/favorites/shared?ids=…`, instantané des biens
 * publics (pas une liste vivante : décision du ticket), qui ne porte rien d'autre que des
 * identifiants de biens — ni nom, ni note, ni compte. WhatsApp en tête (le geste local : « regarde
 * ce que j'ai trouvé »), puis la copie du lien, puis la feuille de partage du téléphone quand elle
 * existe (`navigator.share`).
 */
export function PartageDeSelection({ biens, variante = 'telephone', className }: PartageDeSelectionProps) {
  const t = useTranslations('favorites.partage');
  const locale = useLocale();
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState<'ok' | 'echec' | null>(null);

  const retenus = biens.slice(0, SELECTION_PARTAGEE_MAX);
  if (retenus.length === 0) return null;

  const chemin = cheminDeSelection(locale, retenus.map((b) => b.id));
  const lien = () => `${window.location.origin}${chemin}`;
  const message = () => t('message', { count: retenus.length, url: lien() });
  const partageNatif = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copier() {
    setCopie((await copyToClipboard(lien())) ? 'ok' : 'echec');
  }

  async function autre() {
    try {
      await navigator.share({ title: t('titreDuLien', { count: retenus.length }), text: message() });
    } catch {
      // Feuille refermée par l'utilisateur : rien à dire.
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variante === 'bureau' ? 'default' : 'outline'}
        onClick={() => {
          setCopie(null);
          setOuvert(true);
        }}
        className={cn(
          'h-10 gap-2 rounded-full px-3.5',
          variante === 'bureau' && 'h-11 bg-foreground px-4 text-background hover:bg-foreground/90',
          className,
        )}
      >
        <Share2 className="size-4" aria-hidden="true" />
        {variante === 'bureau' ? t('declencheurBureau') : t('declencheur')}
      </Button>

      <Sheet open={ouvert} onOpenChange={setOuvert}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl px-4 pb-7 pt-5 lg:bottom-8 lg:mx-auto lg:max-w-md lg:rounded-3xl"
        >
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="font-display text-xl font-semibold tracking-[-0.02em]">{t('titre')}</SheetTitle>
            <SheetClose
              aria-label={t('fermer')}
              className="-m-2 inline-flex size-11 flex-none items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" aria-hidden="true" />
            </SheetClose>
          </div>
          <SheetDescription className="mt-1 text-sm text-muted-foreground">{t('texte')}</SheetDescription>

          <div className="mt-4 overflow-hidden rounded-2xl border border-border" data-testid="apercu-selection">
            <div
              className="grid h-28 gap-0.5 bg-border"
              style={{ gridTemplateColumns: `repeat(${Math.min(retenus.length, 3)}, minmax(0, 1fr))` }}
            >
              {retenus.slice(0, 3).map((b) => (
                <div key={b.id} className="relative overflow-hidden bg-muted @container">
                  <PropertyPhoto src={b.main_photo_url} alt="" compact sizes="140px" className="object-cover" />
                </div>
              ))}
            </div>
            <div className="bg-muted/60 px-3.5 py-2.5">
              <p className="text-[15px] font-semibold">{t('titreDuLien', { count: retenus.length })}</p>
              {biens.length > SELECTION_PARTAGEE_MAX ? (
                <p className="text-[13px] text-muted-foreground">{t('borne', { max: SELECTION_PARTAGEE_MAX })}</p>
              ) : null}
            </div>
          </div>

          <a
            href={`https://wa.me/?text=${encodeURIComponent(typeof window === 'undefined' ? '' : message())}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-success text-[15px] font-semibold text-success-foreground transition-colors hover:bg-success/90"
          >
            {t('whatsapp')}
          </a>
          <div className={cn('mt-2 grid gap-2', partageNatif ? 'grid-cols-2' : 'grid-cols-1')}>
            <Button type="button" variant="outline" onClick={() => void copier()} className="h-11 gap-2 rounded-xl text-[15px]">
              {copie === 'ok' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copie === 'ok' ? t('copie') : t('copier')}
            </Button>
            {partageNatif ? (
              <Button type="button" variant="outline" onClick={() => void autre()} className="h-11 gap-2 rounded-xl text-[15px]">
                <Share2 className="size-4" aria-hidden="true" />
                {t('autre')}
              </Button>
            ) : null}
          </div>
          <p className="sr-only" role="status">
            {copie === 'ok' ? t('copie') : copie === 'echec' ? t('copieEchec') : ''}
          </p>
          {copie === 'echec' ? (
            <p className="mt-2 break-all text-xs text-muted-foreground">
              {t('copieEchec')} <span className="font-medium text-foreground">{lien()}</span>
            </p>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
