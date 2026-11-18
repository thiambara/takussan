'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { ProjectionEtatDesLieux } from '@/types/message';

import { CadreDeCarte, CLASSE_DU_GESTE, CLASSE_DU_LIEN, TexteDeCarte, TitreDeCarte, type TonDeLaCarte } from './CadreDeCarte';

/**
 * TCK-2962 — la carte d'un état des lieux. « Relire et signer » n'apparaît que si la projection dit que
 * CE lecteur peut signer (`can_sign_as` non vide) sur un état des lieux à signer : il mène au parcours de
 * signature existant (la fiche, son canevas et son code, `POST /api/inventories/{id}/sign`), qu'une carte
 * ne refait pas. Sinon, un lien vers la fiche.
 */
export function CarteEtatDesLieux({ objet }: { readonly objet: ProjectionEtatDesLieux }) {
  const t = useTranslations('messaging.cartes.etatDesLieux');
  const f = useFormatteurs();
  const statut = objet.status ?? null;
  const signe = statut === 'signed';
  const peutSigner = statut === 'pending_signature' && (objet.can_sign_as?.length ?? 0) > 0;
  const fiche = `/app/inventories/${objet.id}`;

  const quoi = objet.type === 'move_in' ? t('quoiEntree') : objet.type === 'move_out' ? t('quoiSortie') : t('quoi');
  const etat = signe
    ? t('signe')
    : statut === 'disputed'
      ? t('conteste')
      : statut === 'pending_signature'
        ? peutSigner
          ? t('aSigner')
          : t('enAttente')
        : t('enPreparation');
  const ton: TonDeLaCarte = signe ? 'fait' : statut === 'disputed' ? 'alerte' : peutSigner ? 'attend' : 'calme';

  return (
    <CadreDeCarte
      type="etat-des-lieux"
      quoi={quoi}
      etat={etat}
      ton={ton}
      geste={
        peutSigner ? (
          <Link href={fiche} className={cn(buttonVariants(), CLASSE_DU_GESTE)}>
            {t('signer')}
          </Link>
        ) : undefined
      }
      liens={
        peutSigner ? undefined : (
          <Link href={fiche} className={CLASSE_DU_LIEN}>
            {t('voir')}
          </Link>
        )
      }
    >
      {objet.conducted_at ? <TitreDeCarte>{t('realiseLe', { date: f.date(objet.conducted_at, { dateStyle: 'long' }) })}</TitreDeCarte> : null}
      {statut === 'pending_signature' || signe ? (
        <TexteDeCarte className="text-muted-foreground">
          {t('locataire', { etat: objet.tenant_signed ? 'oui' : 'non' })} · {t('bailleur', { etat: objet.owner_signed ? 'oui' : 'non' })}
        </TexteDeCarte>
      ) : null}
    </CadreDeCarte>
  );
}
