'use client';

import { Home } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';

import type { ContexteDuBail as Contexte } from '@/lib/queries/inventory';
import { cn } from '@/lib/utils';
import type { InventoryType } from '@/types/inventory';

import { nomDuLocataire } from './parcours';

/**
 * TCK-2647 (P1 de l'audit) — le logement, le locataire et le bail : l'en-tête qui manquait. Il dit
 * de quel logement il s'agit du premier au dernier écran (maquette `app-etats-des-lieux`, `Contexte`) :
 * vignette de 56 px, le bien, « locataire · bail référence », puis « Entrée · aujourd'hui, 10:30 ».
 */
export function ContexteDuBail({
  bail,
  type,
  quand,
  className,
}: {
  readonly bail: Contexte;
  readonly type: InventoryType;
  /** L'instant de réalisation (ISO) ; absent, la ligne ne dit que le type. */
  readonly quand?: string | null;
  readonly className?: string;
}) {
  const t = useTranslations('inventory.terrain.contexte');
  const titre = bail.property?.title ?? t('bienSansTitre');
  const photo = bail.property?.main_photo_url;
  return (
    <div data-slot="contexte-du-bail" className={cn('flex items-center gap-3', className)}>
      <span className="flex size-14 flex-none items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
        {photo ? (
          // URL de l'API (bien publié ou non) : ni `next/image` ni son optimiseur n'y ont accès.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-full object-cover" />
        ) : (
          <Home className="size-6" strokeWidth={1.75} aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-base font-semibold text-foreground">{titre}</p>
        <p className="truncate text-sm text-encre-douce">{ligneDuBail(t, bail)}</p>
        <p className="truncate text-ui text-muted-foreground">
          <LigneDuType type={type} quand={quand} />
        </p>
      </div>
    </div>
  );
}

/** « Aminata Diop · bail LS-7KQ2ME » — le locataire et la référence, ce que P1 exige de voir. */
export function ligneDuBail(t: (cle: 'locataireEtBail' | 'bailSeul', valeurs: Record<string, string>) => string, bail: Contexte): string {
  const locataire = nomDuLocataire(bail.tenant);
  const reference = bail.reference_number ?? `#${bail.id}`;
  return locataire ? t('locataireEtBail', { locataire, reference }) : t('bailSeul', { reference });
}

/** « Entrée · aujourd'hui, 10:30 » ou « Sortie · 30 juin 2027, 9:00 ». */
export function LigneDuType({ type, quand }: { readonly type: InventoryType; readonly quand?: string | null }) {
  const t = useTranslations('inventory.terrain.contexte');
  const format = useFormatter();
  const maintenant = useNow();
  const libelle = t(type === 'move_out' ? 'sortie' : 'entree');
  const date = quand ? new Date(quand) : null;
  if (!date || Number.isNaN(date.getTime())) return <>{libelle}</>;
  const heure = format.dateTime(date, { hour: 'numeric', minute: '2-digit' });
  const jour = format.dateTime(date, { day: 'numeric', month: 'short', year: 'numeric' });
  const aujourdhui = format.dateTime(date, { dateStyle: 'short' }) === format.dateTime(maintenant, { dateStyle: 'short' });
  return <>{aujourdhui ? t('aujourdhui', { type: libelle, heure }) : t('leJour', { type: libelle, jour, heure })}</>;
}
