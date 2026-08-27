'use client';

import { useState } from 'react';
import { GitCompareArrows, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReportPeriod } from '@/types/super-admin';

import { estPlageLibre, type FenetreRapport } from './window';

/**
 * Sélecteur de fenêtre commun à Croissance et Revenu (TCK-361) : raccourcis, PLAGE LIBRE, et
 * bascule de comparaison à la période précédente.
 *
 * La plage libre n'était pas seulement absente de l'écran — elle n'était pas DEMANDABLE : le
 * `period` de l'API était une énumération fermée (`3m|6m|12m`) ancrée sur `now()`. `starts_at` /
 * `ends_at` ont été ajoutés côté API par ce même ticket ; sans eux, ni cette plage ni la
 * comparaison ne pouvaient exister, la fenêtre décalée n'étant elle non plus pas nommable.
 */
export function ReportWindowControls({
  fenetre,
  onFenetreChange,
  periodes,
  comparaison,
  onComparaisonChange,
}: {
  fenetre: FenetreRapport;
  onFenetreChange: (fenetre: FenetreRapport) => void;
  periodes: readonly ReportPeriod[];
  comparaison: boolean;
  onComparaisonChange: (actif: boolean) => void;
}) {
  const t = useTranslations('reporting');
  const [debut, setDebut] = useState(fenetre.startsAt ?? '');
  const [fin, setFin] = useState(fenetre.endsAt ?? '');

  const plageLibre = estPlageLibre(fenetre);
  const options = periodes.map((value) => ({ value, label: t(`periods.${value}`) }));

  // Les deux bornes ou aucune : l'API refuse une borne seule, et le bouton doit dire la même
  // chose que le serveur plutôt que de laisser partir une requête qui rendra 422.
  const appliquable = Boolean(debut && fin);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={plageLibre ? '' : fenetre.period}
        onValueChange={(value) =>
          onFenetreChange({ period: (value ?? fenetre.period) as ReportPeriod })
        }
        items={options as unknown as Array<{ value: string; label: string }>}
      >
        <SelectTrigger className="h-9 w-36" aria-label={t('filters.periodAria')}>
          <SelectValue placeholder={t('periods.custom')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          value={debut}
          onValueChange={setDebut}
          max={fin || undefined}
          aria-label={t('filters.rangeStart')}
          buttonClassName="h-9"
          data-testid="plage-debut"
        />
        <span className="text-xs text-muted-foreground" aria-hidden="true">→</span>
        <DatePicker
          value={fin}
          onValueChange={setFin}
          min={debut || undefined}
          aria-label={t('filters.rangeEnd')}
          buttonClassName="h-9"
          data-testid="plage-fin"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={!appliquable}
          onClick={() => onFenetreChange({ period: fenetre.period, startsAt: debut, endsAt: fin })}
        >
          {t('filters.rangeApply')}
        </Button>
        {plageLibre && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setDebut('');
              setFin('');
              onFenetreChange({ period: fenetre.period });
            }}
          >
            <X className="mr-1 size-3.5" aria-hidden="true" />
            {t('filters.rangeClear')}
          </Button>
        )}
      </div>

      <Button
        type="button"
        variant={comparaison ? 'secondary' : 'outline'}
        size="sm"
        className="h-9"
        aria-pressed={comparaison}
        onClick={() => onComparaisonChange(!comparaison)}
      >
        <GitCompareArrows className="mr-1.5 size-3.5" aria-hidden="true" />
        {t('chart.compare')}
      </Button>
    </div>
  );
}
