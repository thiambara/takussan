'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { RadarMandatePreview } from '@/types/radar';
import { useLibelleCodePublication } from '../annonceur/useMessageEchecAnnonceur';

interface PublierSousMandatProps {
  readonly mandat: RadarMandatePreview;
  /** La première publication sous mandat de cet annonceur, s'il y en a eu une. */
  readonly depuis: string | null;
  /** TCK-2421 — l'annonceur a repris ses biens dans son espace : la période de mandat est close. */
  readonly reprisLe: string | null;
  readonly nbCochees: number;
  /** Un geste est en cours, la prise n'est pas à soi, l'annonceur a dit STOP, ou la sélection dépasse le plafond de photos. */
  readonly desactive: boolean;
  readonly onPublier: () => void;
}

/**
 * TCK-2394 (ADR-0079, proposé) — la publication sous mandat Takussan : l'annonceur a donné son accord mais ne veut pas de
 * compte ; Takussan publie ses annonces dans son propre espace, avec le numéro de l'annonceur pour contact. Le panneau
 * n'existe que drapeau `radar_mandate` allumé (l'API rend `enabled` faux sinon) ; il dit ce qui bloque, et le geste ouvre
 * la confirmation. Les annonces cochées sont celles de l'écran : les mêmes gardes que « Publier pour lui ».
 */
export function PublierSousMandat({ mandat, depuis, reprisLe, nbCochees, desactive, onPublier }: PublierSousMandatProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.mandate');
  const fmt = useFormatteurs();
  const libelle = useLibelleCodePublication();
  const ouvert = mandat.blocking.length === 0;

  return (
    <section aria-label={t('heading')} className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-publication-mandat">
      <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
      <p className="text-sm text-foreground">{mandat.space ? t('body', { space: mandat.space.name }) : t('bodyNoSpace')}</p>
      {depuis ? (
        <p className="text-xs text-muted-foreground" data-testid="radar-publication-mandat-depuis">
          {reprisLe ? t('takenBack', { date: fmt.date(reprisLe) }) : t('already', { date: fmt.date(depuis) })}
        </p>
      ) : null}
      {ouvert ? null : (
        <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="radar-publication-mandat-blocage">
          <p className="font-medium">{t('blocking')}</p>
          <ul className="list-inside list-disc">
            {mandat.blocking.map((code) => <li key={code}>{libelle(code)}</li>)}
          </ul>
        </div>
      )}
      <Button type="button" variant="outline" disabled={!ouvert || desactive || nbCochees === 0} onClick={onPublier}>
        {t('cta', { count: nbCochees })}
      </Button>
    </section>
  );
}
