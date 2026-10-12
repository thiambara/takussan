'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useController, useWatch, type UseFormReturn } from 'react-hook-form';

import { FormError } from '@/components/forms';
import { Combobox, replierPourIdentite, type OptionDeListe } from '@/components/ui/combobox';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { cn } from '@/lib/utils';
import { useReferentielGeo } from './useReferentielGeo';

type Identifiant = number | null | undefined;

/** Le seul élément de `liste` dont le nom vaut `texte` à la casse près — aucun s'il y en a deux. */
function seulHomonyme<T extends { readonly name: string }>(liste: readonly T[], texte: string | undefined): T | null {
  const cle = replierPourIdentite(texte ?? '');
  if (cle === '') return null;
  const trouves = liste.filter((e) => replierPourIdentite(e.name) === cle);
  return trouves.length === 1 ? trouves[0] : null;
}

const CLASSE_FLASH = cn('wizard-flash', 'rounded-lg');

/**
 * TCK-633 (AC9) — région, ville et quartier choisis dans le référentiel (ADR-0062).
 *
 * Le TEXTE reste la valeur du formulaire (`region`, `city`, `quarter`) : c'est lui qu'on affiche,
 * qu'on envoie et que le serveur canonise. L'identifiant (`geo_*_id`) le PRÉCISE quand la saisie
 * est un choix de la liste — et retombe à `null` dès qu'on retape, faute de quoi un texte corrigé
 * partirait avec l'identifiant de l'ancien choix.
 *
 * Trois chemins posent un identifiant, et un seul en efface :
 *  - choisir dans la liste ;
 *  - un texte déjà là (brouillon repris, suggestion de la géo-IP, bien existant) qui est le nom
 *    EXACT, à la casse près, d'une seule entrée chargée — le rapprochement ci-dessous ;
 *  - choisir une ville pose aussi sa région (texte et identifiant).
 *  Retaper efface. Un quartier inconnu s'ajoute depuis la liste et part en texte seul : c'est le
 *  serveur qui en fait une proposition (`GeoNeighborhood::proposer`).
 *
 * ⚠ La structure DOM (enveloppe > `<label>` + groupe > saisie) est celle de `FormInput` : le test
 * du flash de `StepLieu` remonte de la saisie à l'enveloppe par `closest('div').parentElement`.
 */
export function ChampsLieu({
  form,
  flash = [],
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /** Les champs que la suggestion de la géo-IP vient de remplir (`StepLieu`). */
  readonly flash?: readonly ('city' | 'region')[];
}) {
  const t = useTranslations('property.form');
  const { control, setValue } = form;
  const region = useController({ control, name: 'region' });
  const ville = useController({ control, name: 'city' });
  const quartier = useController({ control, name: 'quarter' });
  const [regionIdSuivi, villeIdSuivi, quartierIdSuivi] = useWatch({
    control,
    name: ['geo_region_id', 'geo_city_id', 'geo_neighborhood_id'],
  });
  const regionId = (regionIdSuivi as Identifiant) ?? null;
  const villeId = (villeIdSuivi as Identifiant) ?? null;
  const quartierId = (quartierIdSuivi as Identifiant) ?? null;
  const texteRegion = (region.field.value as string | undefined) ?? '';
  const texteVille = (ville.field.value as string | undefined) ?? '';
  const texteQuartier = (quartier.field.value as string | undefined) ?? '';

  const { regions, villes, quartiers, chargement } = useReferentielGeo(regionId, villeId);

  // La dernière ville IDENTIFIÉE : la frappe efface `geo_city_id` avant qu'on choisisse, et c'est
  // pourtant à elle qu'appartient le quartier déjà saisi.
  const derniereVille = useRef<number | null>(villeId);
  useEffect(() => {
    if (villeId !== null) derniereVille.current = villeId;
  }, [villeId]);

  // Le rapprochement : un texte venu d'ailleurs que la liste reçoit son identifiant s'il nomme
  // exactement une entrée. Sans `shouldDirty` : ce n'est pas une saisie.
  useEffect(() => {
    if (regionId !== null) return;
    const trouvee = seulHomonyme(regions, texteRegion);
    if (trouvee) setValue('geo_region_id', trouvee.id);
  }, [regionId, regions, texteRegion, setValue]);

  useEffect(() => {
    if (villeId !== null) return;
    const trouvee = seulHomonyme(villes, texteVille);
    if (!trouvee) return;
    setValue('geo_city_id', trouvee.id);
    // La région suit la ville au moment où celle-ci est IDENTIFIÉE, et seulement si personne n'en
    // a écrit : pas en continu, sinon vider la région pour en choisir une autre la ferait revenir.
    if (regionId !== null || texteRegion.trim() !== '') return;
    const sienne = regions.find((r) => r.id === trouvee.region_id);
    if (!sienne) return;
    setValue('region', sienne.name);
    setValue('geo_region_id', sienne.id);
  }, [villeId, villes, texteVille, regionId, texteRegion, regions, setValue]);

  useEffect(() => {
    if (quartierId !== null || villeId === null) return;
    const trouve = seulHomonyme(quartiers, texteQuartier);
    if (trouve) setValue('geo_neighborhood_id', trouve.id);
  }, [quartierId, villeId, quartiers, texteQuartier, setValue]);

  const optionsRegions: OptionDeListe[] = regions.map((r) => ({ value: String(r.id), label: r.name }));
  const optionsVilles: OptionDeListe[] = villes.map((v) => ({ value: String(v.id), label: v.name }));
  const optionsQuartiers: OptionDeListe[] = quartiers.map((q) => ({
    value: String(q.id),
    label: q.name,
    indice: q.status === 'pending' ? t('amenities.pending') : undefined,
  }));

  const viderQuartier = () => {
    quartier.field.onChange('');
    setValue('geo_neighborhood_id', null, { shouldDirty: true });
  };

  const choisirRegion = (option: OptionDeListe | null) => {
    const id = option ? Number(option.value) : null;
    setValue('geo_region_id', id, { shouldDirty: true });
    // Une ville choisie HORS de la nouvelle région n'y est plus : elle part, son quartier aussi.
    const villeActuelle = villes.find((v) => v.id === villeId);
    if (id !== null && villeActuelle && villeActuelle.region_id !== id) {
      ville.field.onChange('');
      setValue('geo_city_id', null, { shouldDirty: true });
      viderQuartier();
    }
  };

  const choisirVille = (option: OptionDeListe | null) => {
    const choisie = option ? villes.find((v) => String(v.id) === option.value) ?? null : null;
    if (!choisie) return;
    // Une AUTRE ville que la dernière identifiée vide le quartier ; la même le garde.
    if (derniereVille.current !== null && derniereVille.current !== choisie.id) viderQuartier();
    setValue('geo_city_id', choisie.id, { shouldDirty: true });
    const sienne = regions.find((r) => r.id === choisie.region_id);
    if (sienne) {
      region.field.onChange(sienne.name);
      setValue('geo_region_id', sienne.id, { shouldDirty: true });
    }
  };

  const quartierNouveau =
    villeId !== null &&
    texteQuartier.trim() !== '' &&
    quartierId === null &&
    !chargement.quartiers &&
    seulHomonyme(quartiers, texteQuartier) === null;

  return (
    <>
      <div className={cn('w-full', flash.includes('region') && CLASSE_FLASH)}>
        <label htmlFor="champ-region" className="mb-1.5 block text-sm font-medium">
          {t('address.region')}
        </label>
        <Combobox
          id="champ-region"
          options={optionsRegions}
          value={regionId === null ? null : String(regionId)}
          onChange={choisirRegion}
          saisieLibre={{
            texte: texteRegion,
            surSaisie: (texte) => {
              region.field.onChange(texte);
              setValue('geo_region_id', null, { shouldDirty: true });
            },
          }}
          inputRef={region.field.ref}
          placeholder={t('address.regionPlaceholder')}
          aucunResultat={t('address.noResults')}
          invalide={Boolean(region.fieldState.error)}
          decritPar={region.fieldState.error ? 'champ-region-error' : undefined}
        />
        <FormError id="champ-region-error">{region.fieldState.error?.message}</FormError>
      </div>

      <div className={cn('w-full', flash.includes('city') && CLASSE_FLASH)}>
        <label htmlFor="champ-ville" className="mb-1.5 block text-sm font-medium">
          {t('address.city')}
          <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
        </label>
        <Combobox
          id="champ-ville"
          options={optionsVilles}
          value={villeId === null ? null : String(villeId)}
          onChange={choisirVille}
          saisieLibre={{
            texte: texteVille,
            surSaisie: (texte) => {
              ville.field.onChange(texte);
              setValue('geo_city_id', null, { shouldDirty: true });
              // Le quartier identifié appartenait à l'ancienne ville ; son TEXTE reste, et se
              // rapprochera dans la nouvelle s'il y existe.
              setValue('geo_neighborhood_id', null, { shouldDirty: true });
            },
          }}
          inputRef={ville.field.ref}
          placeholder={t('address.cityPlaceholder')}
          aucunResultat={t('address.noResults')}
          chargement={chargement.villes}
          required
          invalide={Boolean(ville.fieldState.error)}
          decritPar={ville.fieldState.error ? 'champ-ville-error' : undefined}
        />
        <FormError id="champ-ville-error">{ville.fieldState.error?.message}</FormError>
      </div>

      <div className="w-full">
        <label htmlFor="champ-quartier" className="mb-1.5 block text-sm font-medium">
          {t('address.quarter')}
        </label>
        <Combobox
          id="champ-quartier"
          options={optionsQuartiers}
          value={quartierId === null ? null : String(quartierId)}
          onChange={(option) =>
            setValue('geo_neighborhood_id', option ? Number(option.value) : null, { shouldDirty: true })
          }
          saisieLibre={{
            texte: texteQuartier,
            surSaisie: (texte) => {
              quartier.field.onChange(texte);
              setValue('geo_neighborhood_id', null, { shouldDirty: true });
            },
          }}
          creation={
            villeId === null
              ? undefined
              : {
                  libelle: (nom) => t('address.create', { name: nom }),
                  surCreation: (nom) => {
                    quartier.field.onChange(nom);
                    setValue('geo_neighborhood_id', null, { shouldDirty: true });
                  },
                }
          }
          inputRef={quartier.field.ref}
          placeholder={t('address.quarterPlaceholder')}
          aucunResultat={t('address.noResults')}
          chargement={chargement.quartiers}
          invalide={Boolean(quartier.fieldState.error)}
          decritPar={quartierNouveau ? 'champ-quartier-indice' : quartier.fieldState.error ? 'champ-quartier-error' : undefined}
        />
        {quartierNouveau ? (
          <p id="champ-quartier-indice" className="mt-1 text-xs text-muted-foreground">
            {t('address.newNeighborhoodHint')}
          </p>
        ) : null}
        <FormError id="champ-quartier-error">{quartier.fieldState.error?.message}</FormError>
        {/* ADR-0062 §3 — la mention ODbL est due là où le référentiel est servi. */}
        <p className="mt-1 text-[11px] text-muted-foreground">{t('address.osmCredit')}</p>
      </div>
    </>
  );
}
