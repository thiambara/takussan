'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';

/**
 * TCK-2675 — une fenêtre du rapprochement (importer, réglages de l'import, chercher une ligne) :
 * une feuille du bas au téléphone, un dialogue au bureau (dès `md`, comme « Couvrir une absence »).
 * Le corps défile entre l'en-tête et le bord : rien ne sort de l'écran, quel que soit le contenu.
 */
export function FenetreAdaptee({
  ouvert,
  onFermer,
  titre,
  description,
  children,
  large = false,
}: {
  readonly ouvert: boolean;
  readonly onFermer: () => void;
  readonly titre: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** Le paramétrage CSV : deux colonnes de champs au bureau. */
  readonly large?: boolean;
}) {
  const t = useTranslations('admin.reconciliation.actions');
  const bureau = useMatchesMedia('(width >= 48rem)');

  if (!bureau) {
    return (
      <FeuilleDuBas open={ouvert} onOpenChange={(o) => (o ? null : onFermer())} titre={titre}>
        {description ? <p className="mb-4 text-sm text-muted-foreground">{description}</p> : null}
        {children}
      </FeuilleDuBas>
    );
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => (o ? null : onFermer())}>
      <DialogContent
        showCloseButton={false}
        className={cn('flex max-h-[calc(100dvh-var(--spacing)*16)] flex-col gap-0 overflow-hidden p-0', large ? 'sm:max-w-[45rem]' : 'sm:max-w-[35rem]')}
      >
        <DialogHeader className="flex-none flex-row items-start gap-2 border-b border-border py-3.5 pr-3 pl-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="font-display text-lg font-semibold tracking-titre">{titre}</DialogTitle>
            {description ? <DialogDescription className="mt-0.5 text-sm text-muted-foreground">{description}</DialogDescription> : null}
          </div>
          <DialogClose render={<Button variant="ghost" size="icon" aria-label={t('fermer')} className="text-muted-foreground" />}>
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
