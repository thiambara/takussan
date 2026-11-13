'use client';

import { useId, useState } from 'react';
import { ChevronRight, Rss } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Combobox, type OptionDeListe } from '@/components/ui/combobox';
import { Switch } from '@/components/ui/switch';
import { useBiensDeLAgenda } from '@/lib/queries/agenda';
import { cn } from '@/lib/utils';
import type { CalendarEventType } from '@/types/calendar';
import { paletteForType } from '@/components/calendar/event-colors';
import { HACHURE, Segmente } from './pieces';

const TOUS = '__tous__';

export interface FiltresDeLAgendaProps {
  /** « Qui » : le personnel seul (`mine`). `null` : pas de choix. */
  readonly qui: { readonly mine: boolean; readonly onChange: (mine: boolean) => void } | null;
  readonly typesOfferts: readonly CalendarEventType[];
  readonly types: readonly CalendarEventType[];
  readonly onBasculer: (type: CalendarEventType) => void;
  readonly onReinitialiser: () => void;
  readonly bien: { readonly id: number; readonly titre: string } | null;
  readonly onBien: (bien: { readonly id: number; readonly titre: string } | null) => void;
  /** L'abonnement iCal (agent, admin d'agence) : la ligne qui ouvre sa feuille. */
  readonly onAbonnement: (() => void) | null;
}

/** Le bien : l'index des biens par leur titre, cherché au serveur dès deux caractères. */
function ChoixDuBien({ bien, onBien }: Pick<FiltresDeLAgendaProps, 'bien' | 'onBien'>) {
  const t = useTranslations('agenda.filtres');
  const id = useId();
  const [texte, setTexte] = useState(bien?.titre ?? '');
  const recherche = bien && texte === bien.titre ? '' : texte;
  const biens = useBiensDeLAgenda(recherche);
  const options: OptionDeListe[] = [
    { value: TOUS, label: t('tousLesBiens') },
    ...(bien && !(biens.data?.data ?? []).some((b) => b.id === bien.id) ? [{ value: String(bien.id), label: bien.titre }] : []),
    ...(biens.data?.data ?? []).map((b) => ({ value: String(b.id), label: b.title })),
  ];
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {t('bien')}
      </label>
      <Combobox
        id={id}
        options={options}
        value={bien ? String(bien.id) : TOUS}
        placeholder={t('tousLesBiens')}
        chargement={biens.isFetching}
        aucunResultat={t('aucunBien')}
        saisieLibre={{ texte, surSaisie: setTexte }}
        onChange={(o) => {
          if (!o || o.value === TOUS) {
            setTexte('');
            onBien(null);
            return;
          }
          onBien({ id: Number(o.value), titre: o.label });
        }}
      />
      <p className="mt-1 text-xs text-muted-foreground">{t('bienAide')}</p>
    </div>
  );
}

/**
 * Les filtres de l'agenda (feuille au téléphone, panneau au bureau) : qui, les types (un au moins
 * reste allumé), le bien, la légende de l'attente, et l'abonnement iCal.
 */
export function FiltresDeLAgenda({ qui, typesOfferts, types, onBasculer, onReinitialiser, bien, onBien, onAbonnement }: FiltresDeLAgendaProps) {
  const t = useTranslations('agenda');
  return (
    <div data-slot="filtres-de-l-agenda" className="space-y-5 pt-1">
      {qui ? (
        <div>
          <p className="mb-1.5 text-sm font-medium">{t('filtres.qui')}</p>
          <Segmente
            libelle={t('filtres.qui')}
            options={[
              { valeur: 'moi', libelle: t('qui.mesRendezVous') },
              { valeur: 'agence', libelle: t('qui.touteLAgence') },
            ]}
            actif={qui.mine ? 'moi' : 'agence'}
            onChange={(v) => qui.onChange(v === 'moi')}
          />
        </div>
      ) : null}
      {typesOfferts.length > 1 ? (
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">{t('filtres.types')}</p>
            <button type="button" onClick={onReinitialiser} className="text-ui font-medium text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
              {t('filtres.reinitialiser')}
            </button>
          </div>
          <ul className="mt-1 divide-y divide-border">
            {typesOfferts.map((type) => {
              const actif = types.includes(type);
              return (
                <li key={type}>
                  <label className="flex h-12 cursor-pointer items-center gap-3 text-corps">
                    <span className={cn('size-3 flex-none rounded-full', paletteForType(type).accent)} aria-hidden="true" />
                    <span className="flex-1">{t(`typesPluriel.${type}`)}</span>
                    <Switch checked={actif} data-testid={`calendar-type-toggle-${type}`} disabled={actif && types.length === 1} onCheckedChange={() => onBasculer(type)} />
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">{t('filtres.unTypeAuMoins')}</p>
        </div>
      ) : null}
      <ChoixDuBien bien={bien} onBien={onBien} />
      <div>
        <p className="mb-2 text-sm font-medium">{t('filtres.legende')}</p>
        <p className="flex items-center gap-2.5 text-sm text-encre-douce">
          <span className={cn('h-5 w-9 flex-none rounded border', HACHURE)} aria-hidden="true" />
          {t('filtres.enAttente')}
        </p>
      </div>
      {onAbonnement ? (
        <button
          type="button"
          onClick={onAbonnement}
          className="flex min-h-12 w-full items-center gap-3 border-t border-border pt-3 text-left text-corps outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Rss className="size-icone text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <span className="flex-1">{t('filtres.abonner')}</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
