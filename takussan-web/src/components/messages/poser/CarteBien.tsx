'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

import { CadreDeCarte, Chiffre, CLASSE_DU_GESTE, CLASSE_DU_LIEN, TitreDeCarte } from '../cartes/CadreDeCarte';

/**
 * TCK-2964 — la projection du bien partagé (`SujetsDuFil`, type `property`) : des clés de sa fiche
 * publique, et les gestes du lecteur. Toute clé est facultative ; le droit se lit dans `abilities`.
 */
export type ProjectionBien = {
  readonly id: number;
  readonly slug?: string | null;
  readonly title?: string | null;
  readonly price?: number | null;
  readonly currency?: string | null;
  readonly contract_type?: string | null;
  readonly rent_period?: string | null;
  readonly status?: string | null;
  readonly bedrooms?: number | null;
  readonly area?: number | null;
  readonly available_from?: string | null;
  readonly main_photo_url?: string | null;
  readonly location?: { readonly quarter?: string | null; readonly city?: string | null } | null;
  readonly abilities?: { readonly request_visit?: boolean; readonly [geste: string]: unknown };
};

/**
 * TCK-2964 (maquette `fil-cartes` D, `BienD`) — la carte d'un bien partagé : la photo en tête, le prix en
 * chiffre clé, le titre. Un seul geste, « Demander une visite », pour qui le lit parce qu'il est publié
 * (`abilities.request_visit`) : il mène à la fiche publique, où vit le parcours de demande de visite.
 * Celui qui gère le bien (l'agent qui l'a partagé) n'a rien à faire : un lien vers sa fiche de gestion.
 */
export function CarteBien({ objet }: { readonly objet: ProjectionBien }) {
  const t = useTranslations('messaging.cartes.bien');
  const f = useFormatteurs();
  const locale = useLocale() as Locale;
  // L'instant du premier rendu : « Libre le … » ne se dit que d'une date à venir.
  const [maintenant] = useState(() => Date.now());
  const lieu = [objet.location?.quarter, objet.location?.city].filter((x): x is string => Boolean(x?.trim())).join(', ');
  const surface = objet.area ? t('surface', { surface: objet.area }) : null;
  const quoi = lieu ? [t('quoi', { lieu }), surface].filter(Boolean).join(' · ') : t('quoiSansLieu');
  const libre = objet.available_from && new Date(objet.available_from).getTime() > maintenant ? t('libreLe', { date: f.jourMois(objet.available_from) }) : undefined;
  const periode = objet.contract_type === 'rent' && objet.rent_period ? t('periode', { periode: objet.rent_period }) : '';
  const demander = objet.abilities?.request_visit === true && Boolean(objet.slug);

  return (
    <CadreDeCarte
      type="bien"
      media={
        objet.main_photo_url ? (
          <span data-slot="photo-du-bien" className="relative block aspect-[16/10] bg-muted">
            <Image src={objet.main_photo_url} alt="" fill sizes="(width >= 48rem) 25rem, 88vw" className="object-cover" />
          </span>
        ) : undefined
      }
      quoi={quoi}
      etat={libre}
      geste={
        demander ? (
          <Link href={hrefLocalise(`/properties/${encodeURIComponent(objet.slug!)}`, locale)} className={cn(buttonVariants(), CLASSE_DU_GESTE)}>
            {t('demanderUneVisite')}
          </Link>
        ) : undefined
      }
      liens={
        demander ? undefined : (
          <Link href={`/app/properties/${objet.id}`} className={CLASSE_DU_LIEN}>
            {t('voir')}
          </Link>
        )
      }
    >
      {objet.price != null ? (
        <Chiffre>
          {f.montant(objet.price, objet.currency)}
          {periode ? <span className="ml-1 font-sans text-corps font-normal tracking-normal text-muted-foreground">{periode}</span> : null}
        </Chiffre>
      ) : null}
      {objet.title?.trim() ? <TitreDeCarte className="mt-2">{objet.title.trim()}</TitreDeCarte> : null}
    </CadreDeCarte>
  );
}
