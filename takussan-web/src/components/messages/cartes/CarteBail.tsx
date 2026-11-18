'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { ProjectionBail } from '@/types/message';

import { CadreDeCarte, Chiffre, CLASSE_DU_LIEN, TexteDeCarte, TitreDeCarte, type TonDeLaCarte } from './CadreDeCarte';

const ETATS: Readonly<Record<string, string>> = {
  draft: 'brouillon',
  pending_signature: 'aSigner',
  active: 'enCours',
  expired: 'expire',
  terminating: 'preavis',
  terminated: 'resilie',
  renewed: 'renouvele',
};

/** TCK-2962 — la carte d'un bail : le bien, la période, le loyer tel que le lecteur le lit, et sa fiche. */
export function CarteBail({ objet }: { readonly objet: ProjectionBail }) {
  const t = useTranslations('messaging.cartes.bail');
  const f = useFormatteurs();
  const statut = objet.status ?? null;
  const ton: TonDeLaCarte = statut === 'active' ? 'fait' : 'calme';

  return (
    <CadreDeCarte
      type="bail"
      quoi={t('quoi', { reference: objet.reference_number ?? `#${objet.id}` })}
      etat={statut && ETATS[statut] ? t(ETATS[statut]) : undefined}
      ton={ton}
      liens={
        <Link href={`/app/leases/${objet.id}`} className={CLASSE_DU_LIEN}>
          {t('voir')}
        </Link>
      }
    >
      {objet.property?.title ? <TitreDeCarte>{objet.property.title}</TitreDeCarte> : null}
      {typeof objet.monthly_rent === 'number' ? (
        <div className="mt-2">
          <Chiffre>
            {f.montantCourt(objet.monthly_rent, objet.currency)}
            <span className="ml-1 font-sans text-corps font-normal tracking-normal text-muted-foreground">{t('parMois')}</span>
          </Chiffre>
        </div>
      ) : null}
      {objet.start_date && objet.end_date ? (
        <TexteDeCarte className="text-muted-foreground">{t('periode', { debut: f.jourMois(objet.start_date), fin: f.jourMois(objet.end_date) })}</TexteDeCarte>
      ) : null}
    </CadreDeCarte>
  );
}
