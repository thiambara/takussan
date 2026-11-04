'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Combobox, ComboboxMultiple, type OptionDeListe } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useQuartiersDuReferentiel, useVillesDuReferentiel } from '@/lib/queries/referentiel-public';
import type { RadarTargetNeighborhood } from '@/types/radar';

/**
 * TCK-2469 — les lieux d'une cible se CHOISISSENT dans le référentiel, comme dans les filtres de la recherche publique
 * (`ChoixDuReferentiel`, TCK-633) : mêmes listes (`/api/public/geo/*`), même primitive. Une faute de frappe n'y entre
 * pas — l'API compare par la clé du référentiel, et un nom qu'il ignore ne retiendrait aucune carte.
 *
 * Deux écarts, voulus : une cible porte PLUSIEURS villes et PLUSIEURS quartiers (la recherche, un de chaque), et un
 * quartier garde sa ville (`{name, city}`) — on choisit une ville pour lister ses quartiers, puis on en coche autant
 * qu'on veut, d'une ville ou de plusieurs. Les quartiers en attente de vérification ne sont pas proposés.
 */

const SEPARATEUR = '\u001f';

const cleDuQuartier = (q: RadarTargetNeighborhood) => `${q.name}${SEPARATEUR}${q.city ?? ''}`;

function quartierDeLaCle(cle: string): RadarTargetNeighborhood {
  const [name, city] = cle.split(SEPARATEUR);
  return { name, city: city ? city : null };
}

interface ChoixDesLieuxProps {
  readonly villes: readonly string[];
  readonly quartiers: readonly RadarTargetNeighborhood[];
  readonly onVilles: (villes: string[]) => void;
  readonly onQuartiers: (quartiers: RadarTargetNeighborhood[]) => void;
  readonly desactive?: boolean;
}

export function ChoixDesLieux({ villes, quartiers, onVilles, onQuartiers, desactive = false }: ChoixDesLieuxProps) {
  const t = useTranslations('superAdmin.pages.radar.targets.form');
  const idVilles = useId();
  const idVille = useId();
  const idQuartiers = useId();
  const [villeDesQuartiers, setVilleDesQuartiers] = useState<string | null>(null);

  const referentiel = useVillesDuReferentiel();
  const toutesLesVilles = referentiel.data?.data ?? [];
  // Un nom par option : trois paires d'homonymes du référentiel se départagent par la région, que les critères ne
  // portent pas — l'API compare la ville par son nom.
  const noms = [...new Set(toutesLesVilles.map((v) => v.name))];
  const optionsVilles: OptionDeListe[] = [...new Set([...villes.filter((v) => !noms.includes(v)), ...noms])]
    .map((nom) => ({ value: nom, label: nom }));

  const villeChoisie = toutesLesVilles.find((v) => v.name === villeDesQuartiers);
  const referentielQuartiers = useQuartiersDuReferentiel(villeChoisie?.id ?? null);
  const optionsQuartiers: OptionDeListe[] = (referentielQuartiers.data?.data ?? [])
    .filter((q) => q.status === 'approved')
    .map((q) => ({ value: cleDuQuartier({ name: q.name, city: villeDesQuartiers }), label: q.name }));

  const optionDuQuartier = (q: RadarTargetNeighborhood): OptionDeListe => ({
    value: cleDuQuartier(q),
    label: q.city ? t('neighborhoodIn', { name: q.name, city: q.city }) : q.name,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={idVilles}>{t('cities')}</Label>
        <ComboboxMultiple
          id={idVilles}
          options={optionsVilles}
          valeurs={villes.map((nom) => ({ value: nom, label: nom }))}
          onChange={(choisies) => onVilles(choisies.map((o) => o.value))}
          placeholder={t('citiesPlaceholder')}
          aucunResultat={t('noCity')}
          retirer={(nom) => t('remove', { name: nom })}
          chargement={referentiel.isLoading}
          disabled={desactive}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">{t('neighborhoods')}</legend>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-1">
            <Label htmlFor={idVille} className="text-xs text-muted-foreground">{t('neighborhoodsCity')}</Label>
            <Combobox
              id={idVille}
              options={noms.map((nom) => ({ value: nom, label: nom }))}
              value={villeDesQuartiers}
              onChange={(option) => setVilleDesQuartiers(option?.value ?? null)}
              placeholder={t('neighborhoodsCityPlaceholder')}
              aucunResultat={t('noCity')}
              chargement={referentiel.isLoading}
              disabled={desactive}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={idQuartiers} className="text-xs text-muted-foreground">{t('neighborhoodsPick')}</Label>
            <ComboboxMultiple
              id={idQuartiers}
              options={optionsQuartiers}
              valeurs={quartiers.map(optionDuQuartier)}
              onChange={(choisies) => onQuartiers(choisies.map((o) => quartierDeLaCle(o.value)))}
              placeholder={villeDesQuartiers ? t('neighborhoodsPlaceholder') : t('neighborhoodsNeedCity')}
              aucunResultat={t('noNeighborhood')}
              retirer={(nom) => t('remove', { name: nom })}
              chargement={villeChoisie !== undefined && referentielQuartiers.isLoading}
              disabled={desactive}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('placesHint')}</p>
      </fieldset>
    </div>
  );
}
