'use client';

import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  BellRing,
  BriefcaseBusiness,
  Camera,
  ChevronRight,
  FileSignature,
  House,
  MapPin,
  Megaphone,
  Search,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';

type Icone = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>;

export type Porte = 'chercher' | 'publier' | 'pro';

/**
 * TCK-2608 — les trois portes (maquette `app-entree-orientation`, approche a, écran « Trois portes »).
 * La carte touchée EST la réponse : pas de bouton « Continuer ». Chaque carte est un bouton entier ;
 * le titre en est le nom accessible, le reste sa description.
 */
const PORTES: readonly {
  readonly id: Porte;
  readonly icone: Icone;
  /** Les deux traits qui racontent la porte de part et d'autre de l'icône (dessin du bureau). */
  readonly avant: Icone;
  readonly apres: Icone;
  readonly teinte: string;
}[] = [
  { id: 'chercher', icone: Search, avant: MapPin, apres: BellRing, teinte: 'bg-primary/10 text-primary' },
  { id: 'publier', icone: House, avant: Camera, apres: Megaphone, teinte: 'bg-accent/15 text-accent' },
  // Le pictogramme de droite est le mandat (`FileSignature`) ; celui de gauche, des personnes : le
  // dessin ne promet rien que le texte ne tienne (la carte ne dit pas « équipe », AC3).
  { id: 'pro', icone: BriefcaseBusiness, avant: Users, apres: FileSignature, teinte: 'bg-foreground/6 text-foreground' },
];

const OMBRE_DE_CARTE = 'shadow-[0_1px_2px_color-mix(in_srgb,var(--shadow-color)_10%,transparent)]';

export function PortesDEntree({
  onChoisir,
  enCours,
  fige = false,
}: {
  readonly onChoisir: (porte: Porte) => void;
  /** La porte dont la réponse s'enregistre : toutes les cartes sont figées. */
  readonly enCours: Porte | null;
  /** Une autre réponse s'enregistre (« Plus tard ») : les cartes sont figées aussi. */
  readonly fige?: boolean;
}) {
  const t = useTranslations('onboarding.orientation.portes');
  return (
    <ul className="mt-6 space-y-3 lg:mt-10 lg:grid lg:grid-cols-3 lg:gap-5 lg:space-y-0">
      {PORTES.map((p) => {
        const I = p.icone;
        const A = p.avant;
        const B = p.apres;
        const id = `porte-${p.id}`;
        return (
          <li key={p.id} className="lg:flex">
            <button
              type="button"
              onClick={() => onChoisir(p.id)}
              disabled={enCours !== null || fige}
              aria-labelledby={`${id}-titre`}
              aria-describedby={`${id}-sous ${id}-promesse`}
              aria-busy={enCours === p.id || undefined}
              className={cn(
                'flex w-full rounded-2xl border border-border bg-card text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-default',
                enCours !== null && enCours !== p.id ? 'opacity-60' : null,
                OMBRE_DE_CARTE,
                // Téléphone : une rangée de 88 px au moins. Bureau (dès `lg`) : le dessin, le titre, la promesse.
                'min-h-[5.5rem] items-center gap-3.5 px-4 py-3.5 lg:min-h-0 lg:flex-col lg:items-stretch lg:gap-0 lg:p-5',
              )}
            >
              <span className={cn('inline-flex size-12 flex-none items-center justify-center rounded-xl lg:hidden', p.teinte)}>
                <I className="size-6" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span
                aria-hidden="true"
                className={cn('hidden h-[7rem] items-center justify-center gap-3 rounded-xl lg:flex', p.teinte)}
              >
                <A className="size-6 opacity-60" strokeWidth={1.25} aria-hidden="true" />
                <span className="w-6 border-t border-dashed border-current opacity-40" />
                <I className="size-14" strokeWidth={1} aria-hidden="true" />
                <span className="w-6 border-t border-dashed border-current opacity-40" />
                <B className="size-6 opacity-60" strokeWidth={1.25} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 lg:mt-5 lg:min-h-[5rem] lg:flex-none">
                <span id={`${id}-titre`} className="block text-titre-court font-semibold leading-snug text-balance lg:font-display lg:text-[1.3125rem] lg:leading-[1.15] lg:tracking-titre">
                  {t(`${p.id}.titre`)}
                </span>
                <span id={`${id}-sous`} className="mt-0.5 block text-sm leading-snug text-muted-foreground lg:mt-1.5 lg:leading-5">
                  {t(`${p.id}.sous`)}
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-ui font-medium text-primary lg:hidden">
                  <ArrowRight className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
                  {t(`${p.id}.court`)}
                </span>
              </span>
              <span id={`${id}-promesse`} className="hidden flex-1 border-t border-border pt-4 text-sm leading-snug text-foreground lg:mt-4 lg:block">
                {t(`${p.id}.promesse`)}
              </span>
              <span aria-hidden="true" className="hidden items-center justify-between text-sm font-semibold text-primary lg:mt-5 lg:flex">
                {t('commencer')}
                <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <ChevronRight className="size-5 flex-none text-muted-foreground lg:hidden" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
