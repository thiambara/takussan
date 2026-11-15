'use client';

import { useTranslations } from 'next-intl';
import { Building2, Phone } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { initialesDe, nomCompletDe } from '@/lib/identite';
import type { InterlocuteurDuBailleur } from '@/lib/owner-onboarding';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * TCK-2838 — « Votre interlocuteur » : la personne qui, à l'agence, s'occupe du bailleur invité (maquette
 * `app-entree-assistants`, a, « Bailleur : tes biens », bureau, colonne de droite). Le numéro porté par l'API est
 * public (le principal vérifié de l'invitant, sinon celui de l'agence) ; WhatsApp n'apparaît que sur un numéro
 * déclaré WhatsApp.
 *
 * Les deux gestes sont des liens (`tel:`, `wa.me` dans un nouvel onglet) : ils ne quittent pas l'assistant, dont
 * le profil est encore `draft` (une sortie passe par `onAller`, qui finalise d'abord).
 */
const GESTE =
  'inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-foreground/20 bg-card px-4 text-[0.8125rem] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';

export function CarteDeLInterlocuteur({
  interlocuteur,
  agence,
  className,
}: {
  readonly interlocuteur: InterlocuteurDuBailleur;
  readonly agence: string | null;
  readonly className?: string;
}) {
  const t = useTranslations('onboarding.invite.bailleur.interlocuteur');
  const parLAgence = interlocuteur.source === 'agency';
  const nom = parLAgence ? agence : nomCompletDe(interlocuteur);
  const role = interlocuteur.role ? t(`roles.${interlocuteur.role}`) : null;
  const initiales = parLAgence ? null : initialesDe(interlocuteur);
  const numero = interlocuteur.phone ?? null;
  const chiffres = numero?.replace(/\D/g, '') ?? '';

  if (!numero && !nom) return null;

  return (
    <div className={cn('rounded-2xl border border-border bg-card p-5', className)} data-testid="interlocuteur">
      <p className="text-xs font-medium text-muted-foreground">{t('titre')}</p>
      <div className="mt-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-secondary text-base font-semibold text-primary-deep"
        >
          {initiales ?? <Building2 className="size-5" strokeWidth={1.5} />}
        </span>
        <div className="min-w-0 leading-tight">
          {nom ? <p className="truncate text-[0.9375rem] font-semibold">{nom}</p> : null}
          <p className="truncate text-[0.8125rem] text-muted-foreground">
            {[role, parLAgence ? null : agence].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      {numero ? (
        <div className="mt-4 flex gap-2">
          <a href={`tel:${numero}`} aria-label={t('appeler', { numero: formaterTelephone(numero) })} className={GESTE}>
            <Phone className="size-3.5 flex-none" aria-hidden="true" />
            <span className="truncate tabular-nums">{formaterTelephone(numero)}</span>
          </a>
          {interlocuteur.whatsapp && chiffres ? (
            <a href={`https://wa.me/${chiffres}`} target="_blank" rel="noopener noreferrer" className={GESTE}>
              <IconeWhatsApp className="size-3.5 lg:size-3.5" />
              {t('whatsapp')}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
