'use client';

import { useTranslations } from 'next-intl';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-2682 — la sélection à relancer, telle que l'écran la dit.
 *
 * Pourquoi pas la `BarreDeSelection` des visites (TCK-2587) : elle porte les gestes des visites
 * (« Confirmer (n) », « Attribuer ▾ », les heures proposées) et sa clé de traduction ; il n'en reste
 * en commun que le fond `bg-foreground`. Celle-ci suit la maquette des impayés (`app-argent` a-1) :
 * `h-12 rounded-xl`, le montant de la sélection, la phrase d'aide dès `xl`, « WhatsApp » et
 * « Tout désélectionner ». SMS et E-mail de la maquette n'existent pas : Takussan n'envoie rien
 * (ADR-0105) — écart de la fiche de fidélité.
 */
export function BarreDeSelection({
  n,
  montant,
  nonAffiches,
  onRelancer,
  onToutDeselectionner,
}: {
  readonly n: number;
  readonly montant: string;
  readonly nonAffiches: number;
  readonly onRelancer: () => void;
  readonly onToutDeselectionner: () => void;
}) {
  const t = useTranslations('admin.finances.impayes.lot');
  return (
    <div
      data-slot="barre-de-selection-impayes"
      className="mt-4 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-foreground py-2 pr-2 pl-4 text-sm text-background"
    >
      <span className="font-semibold">
        {t('selection', { count: n })} · <span className="tabular-nums">{montant}</span>
      </span>
      {nonAffiches > 0 ? (
        <span className="font-medium text-background" data-slot="selection-non-affichee">
          {t('nonAffiches', { count: nonAffiches })}
        </span>
      ) : null}
      <span className="text-encre-douce-inverse max-xl:hidden">{t('aide')}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onRelancer}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success px-3 text-ui font-semibold text-success-foreground outline-none hover:bg-success/90 focus-visible:ring-3 focus-visible:ring-ring"
        >
          <IconeWhatsApp className="size-3.5 lg:size-3.5" />
          {t('whatsapp')}
        </button>
        <button
          type="button"
          onClick={onToutDeselectionner}
          className="inline-flex h-8 items-center rounded-md px-2 text-ui text-encre-douce-inverse outline-none hover:text-background focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('toutDeselectionner')}
        </button>
      </span>
    </div>
  );
}

/**
 * Sous `lg` (cartes), en mode sélection : la tête de liste — le compte, le montant, ce qui n'est pas
 * affiché, « Tout sélectionner » (les échéances affichées) — et, dès `md` où la barre collante n'est
 * plus rendue, « Relancer la sélection (n) ». Au téléphone, ce geste est la barre collante du bas.
 * « Annuler » est dans l'en-tête (à la place de « Sélectionner »), Échap et le geste retour aussi.
 */
export function TeteDeSelection({
  n,
  montant,
  nonAffiches,
  toutesCochees,
  onToutSelectionner,
  onRelancer,
}: {
  readonly n: number;
  readonly montant: string;
  readonly nonAffiches: number;
  readonly toutesCochees: boolean;
  readonly onToutSelectionner: () => void;
  readonly onRelancer: () => void;
}) {
  const t = useTranslations('admin.finances.impayes.lot');
  return (
    <>
      <div data-slot="tete-de-selection" className="mb-3 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm" aria-live="polite">
          <span className="font-semibold">{t('selection', { count: n })}</span>
          {n > 0 ? <span className="text-muted-foreground tabular-nums"> · {montant}</span> : null}
          {nonAffiches > 0 ? (
            <span className="block font-medium text-foreground" data-slot="selection-non-affichee">
              {t('nonAffiches', { count: nonAffiches })}
            </span>
          ) : null}
        </p>
        <Button type="button" variant="ghost" disabled={toutesCochees} onClick={onToutSelectionner} className="flex-none text-primary">
          {t('toutSelectionner')}
        </Button>
        <BoutonRelancerLaSelection n={n} onRelancer={onRelancer} className="flex-none max-md:hidden" />
      </div>
      <BarreDAction>
        <BoutonRelancerLaSelection n={n} onRelancer={onRelancer} />
      </BarreDAction>
    </>
  );
}

function BoutonRelancerLaSelection({ n, onRelancer, className }: { readonly n: number; readonly onRelancer: () => void; readonly className?: string }) {
  const t = useTranslations('admin.finances.impayes.lot');
  return (
    <Button
      type="button"
      disabled={n === 0}
      onClick={onRelancer}
      className={cn('gap-2 border-transparent bg-success font-semibold text-success-foreground hover:bg-success/90', className)}
    >
      <IconeWhatsApp className="size-4.5 lg:size-4.5" />
      {t('relancerSelection', { count: n })}
    </Button>
  );
}
