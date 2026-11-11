'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { REQUETE_BARRE_PUBLIQUE } from '@/lib/navigation/barre-publique';

/**
 * TCK-2512 — une feuille de la coque de lien : posée en bas de l'écran au téléphone (la page reste
 * visible et voilée au-dessus), boîte de dialogue de 480 px en bureau. Son contenu ne se monte
 * qu'ouverte.
 */
export function FeuilleDeLien({
  ouverte,
  surChangement,
  titre,
  description,
  children,
  bas,
}: {
  readonly ouverte: boolean;
  readonly surChangement: (ouverte: boolean) => void;
  readonly titre: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** L'action de la feuille, sous le pouce. */
  readonly bas?: ReactNode;
}) {
  const t = useTranslations('common.actions');
  const surTelephone = useMatchesMedia(REQUETE_BARRE_PUBLIQUE);

  if (!surTelephone) {
    return (
      <Dialog open={ouverte} onOpenChange={surChangement}>
        <DialogContent className="max-w-[calc(100%-var(--spacing)*8)] gap-0 rounded-2xl bg-background p-0 sm:max-w-[480px]">
          <div className="px-6 pb-2 pt-6">
            <DialogTitle className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground">{titre}</DialogTitle>
            {description ? (
              <DialogDescription className="mt-1.5 text-[0.9375rem] text-muted-foreground">{description}</DialogDescription>
            ) : null}
          </div>
          <div className="px-6 pb-4">{children}</div>
          {bas ? <div className="space-y-2.5 border-t border-border bg-card px-6 py-4">{bas}</div> : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={ouverte} onOpenChange={surChangement}>
      <SheetContent side="bottom" className="max-h-[calc(100dvh-var(--spacing)*16)] rounded-t-3xl bg-background">
        <span className="mx-auto mt-3 h-1 w-10 flex-none rounded-full bg-border" aria-hidden="true" />
        <div className="flex flex-none items-start justify-between gap-3 px-4 pb-1 pt-2">
          <SheetTitle className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground">{titre}</SheetTitle>
          <SheetClose
            className="-mr-2 -mt-1 inline-flex size-11 flex-none items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('close')}
          >
            <X className="size-5" aria-hidden="true" />
          </SheetClose>
        </div>
        {description ? (
          <SheetDescription className="px-4 text-[0.9375rem] text-muted-foreground">{description}</SheetDescription>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">{children}</div>
        {bas ? (
          <div className="flex-none space-y-2.5 border-t border-border bg-card px-4 pb-[max(var(--spacing)*4,env(safe-area-inset-bottom))] pt-3">
            {bas}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
