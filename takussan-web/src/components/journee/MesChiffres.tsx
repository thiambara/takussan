'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

/** Les chiffres de l'ancien accueil de l'agent (`AgentMeMetrics`). */
export interface ChiffresDeLAgent {
  readonly properties_managed?: unknown;
  readonly pipeline_total?: unknown;
  readonly tasks_open?: unknown;
  readonly tasks_overdue?: unknown;
  readonly commissions_month?: unknown;
}

const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Les cibles des cases : la liste que chaque chiffre compte. */
export const CIBLES_DES_CHIFFRES = {
  biens: '/app/properties?only_mine=1',
  prospects: '/app/customers?vue=mes-clients',
  taches: '/app/tasks?filter[due]=overdue,today,upcoming,none&filter[assigned_to]=me',
  commissions: '/app/commissions',
  rapport: '/app/overview/agent',
} as const;

interface MesChiffresProps {
  readonly chiffres: ChiffresDeLAgent;
  /** Le compte de mes clients à relancer (`filter[follow_up]=1&filter[referent]=me`), s'il est lu. */
  readonly aRelancer: number | null;
  readonly mois: string;
  /** Au bureau, « Voir le rapport du mois » est porté par l'intertitre du bloc. */
  readonly sansPied?: boolean;
  readonly className?: string;
}

/**
 * « Mes chiffres » (maquette `ChiffresAgent`) : les quatre chiffres de l'ancien accueil, en petit, chacun
 * un lien vers sa liste ; le pied mène au rapport du mois.
 */
export function MesChiffres({ chiffres, aRelancer, mois, sansPied, className }: MesChiffresProps) {
  const t = useTranslations('journee.chiffres');
  const f = useFormatteurs();
  const enRetard = nombre(chiffres.tasks_overdue) ?? 0;
  const valeur = (v: unknown) => {
    const n = nombre(v);
    return n === null ? '—' : f.nombre(n);
  };
  const cases: readonly { readonly cle: keyof typeof CIBLES_DES_CHIFFRES; readonly libelle: string; readonly valeur: string; readonly contexte: string | null; readonly alerte?: boolean }[] = [
    { cle: 'biens', libelle: t('biens'), valeur: valeur(chiffres.properties_managed), contexte: null },
    { cle: 'prospects', libelle: t('prospects'), valeur: valeur(chiffres.pipeline_total), contexte: aRelancer !== null && aRelancer > 0 ? t('aRelancer', { n: aRelancer }) : null },
    { cle: 'taches', libelle: t('taches'), valeur: valeur(chiffres.tasks_open), contexte: enRetard > 0 ? t('dontEnRetard', { n: enRetard }) : t('aucuneEnRetard'), alerte: enRetard > 0 },
    { cle: 'commissions', libelle: t('commissions', { mois }), valeur: nombre(chiffres.commissions_month) === null ? '—' : f.montantCourt(nombre(chiffres.commissions_month), 'XOF'), contexte: null },
  ];
  return (
    <div data-slot="mes-chiffres" className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="grid grid-cols-2 gap-px bg-border/70">
        {cases.map((c) => (
          <Link
            key={c.cle}
            href={CIBLES_DES_CHIFFRES[c.cle]}
            aria-label={t('ouvrir', { libelle: c.libelle, valeur: c.valeur, vers: t(`vers.${c.cle}`) })}
            className="block min-h-21 bg-card px-3.5 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex items-center gap-1 text-ui text-muted-foreground">
              <span className="min-w-0 flex-1 text-pretty">{c.libelle}</span>
              <ChevronRight className="size-4 flex-none" aria-hidden="true" />
            </span>
            <span className="mt-0.5 block font-display text-xl font-semibold tabular-nums tracking-titre">{c.valeur}</span>
            {c.contexte ? <span className={cn('block text-xs tabular-nums', c.alerte ? 'text-destructive' : 'text-muted-foreground')}>{c.contexte}</span> : null}
          </Link>
        ))}
      </div>
      {sansPied ? null : (
        <Link
          href={CIBLES_DES_CHIFFRES.rapport}
          className="flex h-11 items-center gap-1 border-t border-border/70 px-3.5 text-sm font-medium text-primary outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="flex-1">{t('rapport')}</span>
          <ChevronRight className="size-4 flex-none" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
