'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Combobox, type OptionDeListe } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useQuartiersDuReferentiel, useVillesDuReferentiel } from '@/lib/queries/referentiel-public';
import type { RadarExtracted, RadarListingDetail } from '@/types/radar';
import { ChampFiche } from './ChampFiche';
import type { SurPassage } from './passage';

interface ChampQuartierProps {
  readonly detail: RadarListingDetail;
  /** Le quartier du référentiel choisi : la lecture, ou la correction en cours. */
  readonly choisi: number | null;
  readonly modifie: boolean;
  readonly desactive: boolean;
  readonly onChoisir: (id: number | null) => void;
  readonly surPassage: SurPassage;
}

/**
 * TCK-2387 (ADR-0062, ADR-0077 §5) — le quartier : ce que l'IA a LU (le texte, jamais réécrit) et le
 * quartier du référentiel que l'opérateur y RATTACHE. Les propositions du rapprochement sont des choix
 * rapides ; à défaut, ville puis quartier du référentiel, approuvés seulement (l'API refuse un quartier
 * en attente ou fusionné). Une fois rattaché, la fiche affiche le lien.
 */
export function ChampQuartier({ detail, choisi, modifie, desactive, onChoisir, surPassage }: ChampQuartierProps) {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const idVille = useId();
  const idQuartier = useId();
  const [villeId, setVilleId] = useState<string | null>(null);

  const lu: RadarExtracted['neighborhood'] = detail.extracted?.neighborhood;
  const suggestions = lu?.suggestions ?? [];

  const villes = useVillesDuReferentiel();
  const quartiers = useQuartiersDuReferentiel(villeId === null ? null : Number(villeId));

  const optionsVilles: OptionDeListe[] = (villes.data?.data ?? []).map((v) => ({ value: String(v.id), label: v.name }));
  const optionsQuartiers: OptionDeListe[] = (quartiers.data?.data ?? [])
    // L'endpoint rend déjà les quartiers approuvés ET les propositions en attente de l'appelant : ce filtre
    // retire les secondes, que l'API refuserait (`neighborhood_id` doit être approuvé).
    .filter((q) => q.status === 'approved')
    .map((q) => ({ value: String(q.id), label: q.name }));

  const lien = detail.neighborhood_link;
  const nomChoisi = suggestions.find((s) => s.id === choisi)?.name
    ?? optionsQuartiers.find((o) => o.value === String(choisi))?.label;

  const etat = modifie
    ? (nomChoisi ? t('neighborhood.pendingChoiceNamed', { name: nomChoisi }) : t('neighborhood.pendingChoice'))
    : lien
      ? (lien.city ? t('neighborhood.linked', { name: lien.name, city: lien.city }) : t('neighborhood.linkedNoCity', { name: lien.name }))
      : t('neighborhood.unlinked');

  return (
    <ChampFiche
      nom="neighborhood"
      libelle={t('fields.neighborhood')}
      champ={lu}
      modifie={modifie}
      texteSource={detail.raw_text}
      surPassage={surPassage}
      groupe
    >
      {({ decritPar }) => (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            {lu?.value ? t('neighborhood.read', { value: lu.value }) : t('neighborhood.unread')}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="radar-neighborhood-link">{etat}</p>

          {suggestions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('neighborhood.suggestions')}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => {
                  const actif = choisi === s.id;
                  return (
                    <Button
                      key={s.id}
                      type="button"
                      size="sm"
                      variant={actif ? 'secondary' : 'outline'}
                      aria-pressed={actif}
                      disabled={desactive}
                      onClick={() => onChoisir(s.id)}
                    >
                      {actif ? <Check aria-hidden="true" /> : null}
                      {s.name} ({s.city})
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={idVille}>{t('neighborhood.pickCity')}</Label>
              <Combobox
                id={idVille}
                options={optionsVilles}
                value={villeId}
                onChange={(option) => setVilleId(option?.value ?? null)}
                placeholder={t('neighborhood.cityPlaceholder')}
                aucunResultat={t('neighborhood.noResult')}
                decritPar={decritPar}
                chargement={villes.isLoading}
                disabled={desactive}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={idQuartier}>{t('neighborhood.pickNeighborhood')}</Label>
              <Combobox
                id={idQuartier}
                options={optionsQuartiers}
                value={choisi === null ? null : String(choisi)}
                onChange={(option) => onChoisir(option ? Number(option.value) : null)}
                placeholder={t('neighborhood.neighborhoodPlaceholder')}
                aucunResultat={t('neighborhood.noResult')}
                decritPar={decritPar}
                chargement={quartiers.isLoading}
                disabled={desactive || villeId === null}
              />
            </div>
          </div>
        </div>
      )}
    </ChampFiche>
  );
}
