'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initialesDe } from '@/lib/identite';
import type { ContactLead } from '@/lib/queries/contact-leads';
import { cn } from '@/lib/utils';

import { ageAffiche, PointDAge, TexteDAge, TroisGestes, useTexteDeLAge, type GestesDeLaDemandeProps } from './pieces';

interface LigneDeDemandeProps extends Omit<GestesDeLaDemandeProps, 'messageWhatsApp'> {
  readonly messageWhatsApp: string;
  readonly maintenant: Date;
  /** La demande ouverte dans le panneau de droite (bureau). */
  readonly ouverte: boolean;
  /** La demande désignée par `?lead=` (lien de notification) : encadrée. */
  readonly designee?: boolean;
  readonly onOuvrir: (lead: ContactLead) => void;
}

/**
 * TCK-2584 — UNE ligne de la boîte, rendue pour les deux largeurs par ses classes (un seul DOM) :
 *
 *  · au téléphone (`app-demandes` a-0) : point d'âge, nom en 16 px, âge (rouge au-delà de 24 h), le
 *    bien (titre) ou « Contact direct », « déjà client·e ✓ », l'extrait du message sur une ligne, puis
 *    les trois gestes de 44 px ;
 *  · dès `lg` (la boîte du bureau, `app-fil-commercial` a-0) : 72 px filet compris, avatar de 36 px, trois lignes de
 *    texte, sans gestes — ils sont dans le panneau de droite ; la ligne ouverte sur fond secondaire
 *    avec son filet de 3 px.
 *
 * Le haut de la ligne est UN bouton qui ouvre la demande ; les gestes sont à côté, jamais dedans.
 */
export function LigneDeDemande(props: LigneDeDemandeProps) {
  const { lead, nom, maintenant, ouverte, designee = false, onOuvrir } = props;
  const t = useTranslations('contactLeads');
  const texteDAge = useTexteDeLAge();
  const age = ageAffiche(lead, maintenant);
  const connu = lead.known_customer ?? null;
  const bien = lead.property?.title ?? t('aboutAgent');
  const initiales = initialesDe({ first_name: nom.split(' ')[0] ?? null, last_name: nom.split(' ').slice(1).join(' ') || null }) ?? '?';

  return (
    <li
      data-slot="ligne-de-demande"
      data-ouverte={ouverte ? '' : undefined}
      aria-current={designee ? 'true' : undefined}
      className={cn(
        'relative border-b border-border bg-card px-4 pt-3 pb-3 lg:px-0 lg:py-0',
        ouverte && 'lg:bg-secondary/70',
        designee && 'ring-2 ring-primary ring-inset',
      )}
    >
      {ouverte ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.75 bg-primary max-lg:hidden" /> : null}
      <button
        type="button"
        onClick={() => onOuvrir(lead)}
        aria-label={t('inbox.open', { name: nom })}
        aria-pressed={ouverte}
        className="block w-full rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring lg:flex lg:h-[calc(var(--spacing)*19.72)] lg:items-center lg:gap-3 lg:rounded-none lg:px-4 lg:focus-visible:ring-inset"
      >
        <Avatar size="36" aria-hidden="true" className="max-lg:hidden">
          <AvatarFallback>{initiales}</AvatarFallback>
        </Avatar>
        <span className="block min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <PointDAge enRetard={age.enRetard} className={lead.handled_at ? 'invisible' : undefined} />
            <span className="min-w-0 flex-1 truncate text-action font-semibold lg:text-sm">{nom}</span>
            <TexteDAge age={age} texte={texteDAge(age)} className="text-ui lg:text-xs" />
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 pl-4 text-sm text-encre-douce lg:mt-0 lg:pl-0 lg:text-ui lg:leading-snug">
            <span className="min-w-0 truncate">{bien}</span>
            {connu ? (
              <span data-slot="deja-client" className="inline-flex min-w-0 shrink-[1000] items-center gap-1 truncate font-medium text-success">
                <span className="truncate">
                  {'· '}
                  <span className="min-[90rem]:hidden">{t('inbox.alreadyCustomer')}</span>
                  <span className="hidden min-[90rem]:inline">
                    {connu.visits_count !== null ? t('inbox.alreadyCustomerVisits', { count: connu.visits_count }) : t('inbox.alreadyCustomer')}
                  </span>
                </span>
                <Check className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
              </span>
            ) : null}
          </span>
          {lead.message ? (
            <span className="mt-0.5 block truncate pl-4 text-sm text-muted-foreground lg:mt-0 lg:pl-0 lg:text-ui lg:leading-snug">« {lead.message}</span>
          ) : null}
        </span>
      </button>
      <TroisGestes {...props} className="mt-2.5 lg:hidden" />
    </li>
  );
}
