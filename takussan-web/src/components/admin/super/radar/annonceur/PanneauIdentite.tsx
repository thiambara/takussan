'use client';

import { useTranslations } from 'next-intl';

import type { RadarAdvertiserDetail } from '@/types/radar';

interface PanneauIdentiteProps {
  readonly annonceur: RadarAdvertiserDetail;
}

/**
 * TCK-2388 — qui est l'annonceur : le nom et le numéro que les annonces ont portés, la nature présumée
 * (libellés de la fiche annonce, réemployés) et les indices qui la fondent, chacun avec le passage cité.
 */
export function PanneauIdentite({ annonceur }: PanneauIdentiteProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const tFiche = useTranslations('superAdmin.pages.radar.listing');

  return (
    <section aria-label={t('identity.heading')} className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-annonceur-identite">
      <h2 className="font-display text-base font-semibold text-foreground">{t('identity.heading')}</h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">{t('identity.name')}</dt>
        <dd className="text-foreground">{annonceur.display_name || t('unnamed')}</dd>
        <dt className="text-muted-foreground">{t('identity.phone')}</dt>
        <dd className="font-mono text-foreground">{annonceur.phone ?? t('noPhone')}</dd>
        <dt className="text-muted-foreground">{t('identity.nature')}</dt>
        <dd className="text-foreground">{tFiche(`options.natures.${annonceur.nature}`)}</dd>
      </dl>

      <div className="space-y-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">{t('identity.signals')}</h3>
        {annonceur.nature_signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('identity.noSignals')}</p>
        ) : (
          <ul className="space-y-2">
            {annonceur.nature_signals.map((s, i) => (
              <li key={`${s.signal}-${i}`} className="rounded-md border bg-background px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{s.signal}</span>
                {s.evidence ? <q className="mt-0.5 block text-xs text-muted-foreground">{s.evidence}</q> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
