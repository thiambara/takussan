'use client';

import { useTranslations } from 'next-intl';

import { RADAR_ADVERTISER_NATURES, type RadarListingDetail } from '@/types/radar';
import { ChampFiche } from './ChampFiche';
import type { SurPassage } from './passage';
import { ChampChoix } from './controles';
import type { CorrectionsFiche } from './useCorrectionsFiche';

interface PanneauNatureProps {
  readonly detail: RadarListingDetail;
  readonly corrections: CorrectionsFiche;
  readonly desactive: boolean;
  readonly surPassage: SurPassage;
}

/**
 * TCK-2387 — la nature présumée de l'annonceur (propriétaire, intermédiaire, agence) et les indices qui
 * la fondent, chacun avec le passage qui le porte : survoler ou focaliser un indice le surligne dans la
 * source, comme un champ. La nature se corrige ; les indices, eux, sont ce que le modèle a relevé.
 */
export function PanneauNature({ detail, corrections, desactive, surPassage }: PanneauNatureProps) {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const extracted = detail.extracted;
  const signaux = extracted?.nature_signals ?? [];
  const nom = extracted?.advertiser_name?.value;

  return (
    <section aria-label={t('nature.heading')} className="space-y-3" data-testid="radar-nature">
      <h3 className="text-sm font-semibold text-foreground">{t('nature.heading')}</h3>
      <ChampFiche
        nom="advertiser_nature"
        libelle={t('fields.advertiser_nature')}
        champ={extracted?.advertiser_nature}
        modifie={corrections.modifie('advertiser_nature')}
        texteSource={detail.raw_text}
        surPassage={surPassage}
        aide={nom ? t('nature.advertiserName', { name: nom }) : undefined}
      >
        {({ id, decritPar }) => (
          <ChampChoix
            id={id}
            decritPar={decritPar}
            desactive={desactive}
            nullable={false}
            valeur={(corrections.valeur('advertiser_nature') as string | null) ?? 'unknown'}
            options={RADAR_ADVERTISER_NATURES.map((n) => ({ value: n, label: t(`options.natures.${n}`) }))}
            onChange={(valeur) => corrections.corriger('advertiser_nature', valeur ?? 'unknown')}
          />
        )}
      </ChampFiche>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t('nature.signals')}</p>
        {signaux.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('nature.noSignals')}</p>
        ) : (
          <ul className="space-y-2">
            {signaux.map((s, i) => (
              <li key={`${s.signal}-${i}`}>
                {/* Un bouton : le focus clavier vaut le survol, et le clic montre le passage sur un écran tactile. */}
                <button
                  type="button"
                  className="block w-full rounded-md border bg-card px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onMouseEnter={() => surPassage(s.evidence, 'survol')}
                  onMouseLeave={() => surPassage(null, 'survol')}
                  onFocus={() => surPassage(s.evidence, 'focus')}
                  onBlur={() => surPassage(null, 'focus')}
                  onClick={() => surPassage(s.evidence, 'focus')}
                >
                  <span className="font-medium text-foreground">{s.signal}</span>
                  {s.evidence ? <q className="mt-0.5 block text-xs text-muted-foreground">{s.evidence}</q> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
