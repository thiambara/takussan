'use client';

import { useTranslations } from 'next-intl';

import type { RadarPublicationAccount } from '@/types/radar';

interface CompteACreerProps {
  readonly nom: string | null;
  readonly compte: RadarPublicationAccount;
}

/**
 * TCK-2389 — ce qui sera créé AU NOM de quelqu'un, dit avant tout le reste : le compte (sans mot de passe, numéro non
 * vérifié, ouvert plus tard par un code SMS), son espace individuel, et que les visiteurs joindront ce numéro. Un
 * compte déjà rattaché (une publication précédente) est repris tel quel.
 */
export function CompteACreer({ nom, compte }: CompteACreerProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.account');
  const nomComplet = [compte.first_name, compte.last_name].filter(Boolean).join(' ');
  const titre = nom ? t('heading', { name: nom }) : t('headingUnnamed');

  return (
    <section aria-label={titre} className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-publication-compte">
      <h2 className="font-display text-base font-semibold text-foreground">{titre}</h2>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{t('account')}</dt>
        <dd className="text-foreground">{compte.exists ? t('existing') : t('new')}</dd>
        <dt className="text-muted-foreground">{t('name')}</dt>
        <dd className="text-foreground">{nomComplet || t('noName')}</dd>
        <dt className="text-muted-foreground">{t('phone')}</dt>
        <dd className="font-mono text-foreground">{compte.phone}</dd>
        <dt className="text-muted-foreground">{t('space')}</dt>
        <dd className="text-foreground">{compte.exists ? t('existingSpace') : compte.space_name}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">{compte.exists ? t('noteExisting') : t('noteNew')}</p>
    </section>
  );
}
