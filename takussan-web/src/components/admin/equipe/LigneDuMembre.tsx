'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, CalendarOff, ChevronRight } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initialesDe, nomAffichable } from '@/lib/identite';
import { cn } from '@/lib/utils';
import type { AdminAgencyUserRow } from '@/types/admin-users';

import { DeuxFacteurs, PuceVous, TextePresence } from './pieces';
import { etatDuMembre, roleDuMembre } from './etat-de-l-equipe';

interface LigneDuMembreProps {
  readonly membre: AdminAgencyUserRow;
  readonly agencyId: number;
  readonly currentUserId: number;
  readonly onOuvrir: (membre: AdminAgencyUserRow) => void;
}

/**
 * TCK-2667 — une personne au téléphone (maquette `app-equipe`, a, « Liste » : `LignePersonne`) : deux
 * lignes — le nom (« Vous »), puis la présence et la double authentification, ou l'absence et qui la
 * couvre, ou l'accès suspendu —, le rôle à droite, le chevron. Le toucher ouvre la fiche.
 */
export function LigneDuMembre({ membre, agencyId, currentUserId, onOuvrir }: LigneDuMembreProps) {
  const t = useTranslations('admin.team.equipe');
  const { jourMois } = useFormatteurs();
  const etat = etatDuMembre(membre, agencyId);
  const absence = membre.current_absence;
  const prenomDuRemplacant = absence?.substitute?.name.trim().split(/\s+/)[0] ?? '';

  return (
    // La hauteur sur la rangée, bordure comprise (maquette : `li min-h-[68px]` sous `divide-y`).
    <li className="flex min-h-17">
      <button
        type="button"
        onClick={() => onOuvrir(membre)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Avatar size="44" className={cn(etat === 'suspendu' && 'opacity-50')}>
          <AvatarFallback>{initialesDe(membre) ?? '·'}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-corps font-semibold', etat === 'suspendu' && 'text-encre-douce')}>{nomAffichable(membre)}</span>
            {membre.id === currentUserId ? <PuceVous /> : null}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-ui text-muted-foreground">
            {etat === 'absent' && absence ? (
              <span className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground">
                <CalendarOff className="size-3.5 flex-none text-warning" aria-hidden="true" />
                <span className="truncate">{t('etat.absent', { date: jourMois(absence.ends_at) })}</span>
                {prenomDuRemplacant && absence.substitute ? (
                  <>
                    <ArrowRight className="size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
                    <span aria-hidden="true">{prenomDuRemplacant}</span>
                    <span className="sr-only">{t('etat.couvertPar', { nom: absence.substitute.name })}</span>
                  </>
                ) : null}
              </span>
            ) : etat === 'suspendu' ? (
              <span className="font-medium text-destructive">{t('etat.accesSuspendu')}</span>
            ) : (
              <>
                <span className="truncate">
                  <TextePresence derniereConnexion={membre.last_login_at} />
                </span>
                {membre.two_factor_enabled !== undefined ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <DeuxFacteurs active={membre.two_factor_enabled} court />
                  </>
                ) : null}
              </>
            )}
          </span>
        </span>
        <span className="flex-none text-ui text-muted-foreground">{t(`role.court.${roleDuMembre(membre, agencyId)}`)}</span>
        <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}
