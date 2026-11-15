'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, Check, CheckCircle2, ImageIcon, Info, Lock } from 'lucide-react';

import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { whatsappHref } from '@/components/crm/contact';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initialesDe, nomAffichable } from '@/lib/identite';
import { formaterTelephone } from '@/lib/phone';
import { FUSEAU_DES_VISITES } from '@/lib/visites/heure-de-dakar';
import { jourEnClair, jourEnToutesLettres } from '@/lib/visites/planification';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-2586 — les pièces de la feuille « Planifier une visite » (maquettes retenues `app-visites` a-5/a-6
 * et `app-fil-commercial` a-1/a-2) : la pastille de choix, le bien (vignette ou recherche unique), le
 * client (carte, recherche ou « sans fiche »), le demandeur d'une demande, et l'écran de succès.
 */

/** Un bien déjà connu de l'appelant, ou choisi dans la recherche. */
export interface BienAPlanifier {
  readonly id: number;
  readonly libelle: string;
  /** La vignette (`main_photo_url`). */
  readonly photo?: string | null;
  /** « Loyer 250 000 F/mois · TK-48877 ». */
  readonly detail?: string | null;
}

/** Une fiche client déjà connue de l'appelant, ou choisie dans la recherche. */
export interface ClientAPlanifier {
  readonly id: number;
  readonly libelle: string;
  readonly telephone?: string | null;
  /** L'étape du pipeline (`pipeline_stage`), traduite ici. */
  readonly etape?: string | null;
}

/* ───────────────────────────── la pastille de choix ───────────────────────────── */

/**
 * La pastille d'un choix de formulaire : la famille de la puce de filtre (annexe B § 3.1, « h-11
 * `px-4` (choix de formulaire) », valeur majoritaire — exception (c) d'ADR-0106 contre le `rounded-xl`
 * primaire de `app-fil-commercial`). Un créneau PRIS est barré, en tirets, et ne se choisit pas : son
 * encre est `muted-foreground` OPAQUE (la maquette l'atténue à 70 %, TCK-658).
 */
export function PastilleDeChoix({
  actif,
  pris = false,
  onChoisir,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  readonly actif: boolean;
  readonly pris?: boolean;
  readonly onChoisir: () => void;
  readonly className?: string;
  readonly children: ReactNode;
  readonly 'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pris ? undefined : actif}
      aria-disabled={pris || undefined}
      aria-label={ariaLabel}
      data-slot="pastille-de-choix"
      data-pris={pris ? '' : undefined}
      onClick={pris ? undefined : onChoisir}
      className={cn(
        'inline-flex h-11 flex-none items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap tabular-nums outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring',
        actif && !pris && 'border-foreground bg-foreground text-background',
        pris && 'cursor-not-allowed border-dashed border-border bg-transparent text-muted-foreground line-through',
        !actif && !pris && 'border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Le libellé d'une section : « Bien », « Quel jour ? »… */
export function TitreDeSection({
  id,
  children,
  droite,
  fort = false,
  className,
}: {
  readonly id?: string;
  readonly children: ReactNode;
  readonly droite?: ReactNode;
  /** Depuis une demande (`app-fil-commercial` a-1) : 15 px en 600 au lieu de 14 px en 500. */
  readonly fort?: boolean;
  readonly className?: string;
}) {
  if (fort) {
    return (
      <p id={id} className={cn('mb-2 text-corps font-semibold', className)}>
        {children}
      </p>
    );
  }
  if (droite) {
    return (
      <div className={cn('mb-2 flex items-baseline justify-between gap-3', className)}>
        <p id={id} className="text-sm font-medium">
          {children}
        </p>
        <p className="text-ui text-muted-foreground">{droite}</p>
      </div>
    );
  }
  return (
    <p id={id} className={cn('mb-1.5 text-sm font-medium', className)}>
      {children}
    </p>
  );
}

export function Vignette({ src, className }: { readonly src?: string | null; readonly className?: string }) {
  return (
    <span className={cn('relative inline-flex flex-none items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground', className)}>
      {src ? <Image src={src} alt="" fill sizes="64px" className="object-cover" /> : <ImageIcon className="size-5" aria-hidden="true" />}
    </span>
  );
}

/* ───────────────────────────── le bien ───────────────────────────── */

interface BienTrouve {
  readonly id: number;
  readonly title: string;
  readonly reference_number?: string | null;
  readonly price?: number | string | null;
  readonly currency?: string | null;
  readonly contract_type?: string | null;
  readonly main_photo_url?: string | null;
}

/** Les colonnes de la recherche du bien ; `main_photo_url` est servie hors de `fields[]` (TCK-336). */
export const PLANIFICATION_PROPERTY_FIELDS = ['id', 'title', 'reference_number', 'price', 'currency', 'contract_type'] as const;

/** Les colonnes de la recherche du client. */
export const PLANIFICATION_CUSTOMER_FIELDS = ['id', 'first_name', 'last_name', 'phone', 'pipeline_stage'] as const;

export function useDetailDuBien() {
  const t = useTranslations('visitPlanning.plan');
  const { montantCourt } = useFormatteurs();
  return (b: Pick<BienTrouve, 'price' | 'currency' | 'contract_type' | 'reference_number'>): string | null => {
    const prix = b.price !== null && b.price !== undefined && b.price !== '' ? montantCourt(Number(b.price), b.currency) : null;
    const partiePrix = prix ? (b.contract_type === 'rent' ? t('rentDetail', { price: prix }) : prix) : null;
    const parties = [partiePrix, b.reference_number ?? null].filter((x): x is string => Boolean(x));
    return parties.length > 0 ? parties.join(' · ') : null;
  };
}

/**
 * Le bien : sa vignette quand il est connu (« Changer » rouvre la recherche), sinon UNE recherche
 * avec vignettes — la fin du couple recherche + liste déroulante (audit § 4).
 */
export function ChoixDuBien({
  bien,
  onChoisir,
  erreur,
}: {
  readonly bien: BienAPlanifier | null;
  readonly onChoisir: (bien: BienAPlanifier | null) => void;
  readonly erreur?: string | null;
}) {
  const t = useTranslations('visitPlanning.plan');
  const detailDe = useDetailDuBien();
  const [terme, setTerme] = useState('');
  // Choisi DANS la recherche, le bien y reste coché (a-5) : un autre résultat se prend d'un geste.
  // Posé par l'appelant (fiche bien, demande), il se montre en carte, « Changer » rouvre la recherche.
  const [dansLaRecherche, setDansLaRecherche] = useState(false);
  const ouverte = bien === null || dansLaRecherche;
  const recherche = useApiQuery<PaginatedResponse<BienTrouve>>(['properties', 'planifier', terme], '/api/properties', {
    params: { fields: { properties: [...PLANIFICATION_PROPERTY_FIELDS] }, filter: terme ? { search: terme } : {}, per_page: 8 },
    enabled: ouverte,
  });

  return (
    <div role="group" aria-labelledby="plan-property-titre">
      <TitreDeSection id="plan-property-titre">{t('property')}</TitreDeSection>
      {bien && !ouverte ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
          <Vignette src={bien.photo} className="size-11" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-corps font-medium">{bien.libelle}</span>
            {bien.detail ? <span className="block truncate text-ui tabular-nums text-muted-foreground">{bien.detail}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => onChoisir(null)}
            className="relative flex-none rounded-sm text-sm font-medium text-primary outline-none after:absolute after:-inset-3 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring"
            aria-label={t('changeProperty')}
          >
            {t('change')}
          </button>
        </div>
      ) : (
        <>
          <DebouncedSearchInput
            id="plan-property"
            value={terme}
            onCommit={setTerme}
            placeholder={t('propertyPlaceholder')}
            aria-label={t('propertyPlaceholder')}
            busy={recherche.isFetching}
          />
          <ResultatsDuBien
            etat={recherche.isError ? 'erreur' : recherche.isPending ? 'chargement' : 'pret'}
            biens={recherche.data?.data ?? []}
            choisi={bien?.id ?? null}
            onChoisir={(b) => {
              setDansLaRecherche(true);
              onChoisir({ id: b.id, libelle: b.title, photo: b.main_photo_url ?? null, detail: detailDe(b) });
            }}
          />
        </>
      )}
      {erreur ? (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

function ResultatsDuBien({
  etat,
  biens,
  choisi,
  onChoisir,
}: {
  readonly etat: 'chargement' | 'erreur' | 'pret';
  readonly biens: readonly BienTrouve[];
  readonly choisi: number | null;
  readonly onChoisir: (b: BienTrouve) => void;
}) {
  const t = useTranslations('visitPlanning.plan');
  const detailDe = useDetailDuBien();
  if (etat === 'chargement') {
    return <p className="mt-2 text-ui text-muted-foreground">{t('searching')}</p>;
  }
  if (etat === 'erreur') {
    return (
      <p role="alert" className="mt-2 text-ui text-destructive">
        {t('searchError')}
      </p>
    );
  }
  if (biens.length === 0) {
    return <p className="mt-2 text-ui text-muted-foreground">{t('noProperty')}</p>;
  }
  // Chaque résultat EST la ligne (a-5 : le filet, le retrait et l'écart sont ceux de la ligne) : un
  // bouton par ligne, sans `li` qui porterait la boîte à sa place.
  return (
    <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {biens.map((b) => {
        const detail = detailDe(b);
        const estChoisi = b.id === choisi;
        return (
          <button
            key={b.id}
            type="button"
            aria-pressed={estChoisi}
            onClick={() => onChoisir(b)}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted',
              estChoisi && 'bg-secondary/60',
            )}
          >
            <Vignette src={b.main_photo_url} className="size-11" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-corps font-medium">{b.title}</span>
              {detail ? <span className="block truncate text-ui tabular-nums text-muted-foreground">{detail}</span> : null}
            </span>
            {estChoisi ? <Check className="size-5 flex-none text-primary" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── le client ───────────────────────────── */

interface ClientTrouve {
  readonly id: number;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly phone?: string | null;
  readonly pipeline_stage?: string | null;
}

function LigneDuClient({ nom, detail, droite }: { readonly nom: string; readonly detail?: string | null; readonly droite?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <Avatar size="36" aria-hidden="true">
        <AvatarFallback>{initialesDe({ first_name: nom.split(' ')[0] ?? null, last_name: nom.split(' ').slice(1).join(' ') || null }) ?? '?'}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-corps font-medium">{nom}</span>
        {detail ? <span className="block truncate text-ui tabular-nums text-muted-foreground">{detail}</span> : null}
      </span>
      {droite}
    </div>
  );
}

/**
 * Le client : sa carte quand il est connu (« Changer »), sinon une recherche ; ou le visiteur SANS
 * FICHE — nom et téléphone (+221 posé), que l'API exige alors (TCK-590).
 */
export function ChoixDuClient({
  client,
  onChoisir,
  sansFiche,
  onSansFiche,
  champsSansFiche,
  erreur,
}: {
  readonly client: ClientAPlanifier | null;
  readonly onChoisir: (client: ClientAPlanifier | null) => void;
  readonly sansFiche: boolean;
  readonly onSansFiche: (sansFiche: boolean) => void;
  /** Les champs nom + téléphone, rendus sous la case quand elle est cochée. */
  readonly champsSansFiche: ReactNode;
  readonly erreur?: string | null;
}) {
  const t = useTranslations('visitPlanning.plan');
  const tEtape = useTranslations('crm.pipeline.stage');
  const [terme, setTerme] = useState('');
  const recherche = useApiQuery<PaginatedResponse<ClientTrouve>>(['customers', 'planifier', terme], '/api/customers', {
    params: { fields: { customers: [...PLANIFICATION_CUSTOMER_FIELDS] }, filter: terme ? { search: terme } : {}, per_page: 8 },
    enabled: client === null && !sansFiche,
  });
  const detailDe = (telephone?: string | null, etape?: string | null) =>
    [telephone ?? null, etape && tEtape.has(etape) ? tEtape(etape) : null].filter((x): x is string => Boolean(x)).join(' · ') || null;

  return (
    <div role="group" aria-labelledby="plan-customer-titre">
      <TitreDeSection id="plan-customer-titre">{t('customer')}</TitreDeSection>
      {client ? (
        <LigneDuClient
          nom={client.libelle}
          detail={detailDe(client.telephone, client.etape)}
          droite={
            <button
              type="button"
              onClick={() => onChoisir(null)}
              className="relative flex-none rounded-sm text-sm font-medium text-primary outline-none after:absolute after:-inset-3 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring"
              aria-label={t('changeCustomer')}
            >
              {t('change')}
            </button>
          }
        />
      ) : sansFiche ? null : (
        <>
          <DebouncedSearchInput
            id="plan-customer"
            value={terme}
            onCommit={setTerme}
            placeholder={t('customerPlaceholder')}
            aria-label={t('customerPlaceholder')}
            busy={recherche.isFetching}
          />
          {recherche.isError ? (
            <p role="alert" className="mt-2 text-ui text-destructive">
              {t('searchError')}
            </p>
          ) : (recherche.data?.data ?? []).length > 0 ? (
            <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {(recherche.data?.data ?? []).map((c) => {
                const nom = nomAffichable(c);
                return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onChoisir({ id: c.id, libelle: nom, telephone: c.phone ?? null, etape: c.pipeline_stage ?? null })}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
                    >
                      <Avatar size="36" aria-hidden="true">
                        <AvatarFallback>{initialesDe(c) ?? '?'}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-corps font-medium">{nom}</span>
                        {detailDe(c.phone, c.pipeline_stage) ? (
                          <span className="block truncate text-ui tabular-nums text-muted-foreground">{detailDe(c.phone, c.pipeline_stage)}</span>
                        ) : null}
                      </span>
                    </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={sansFiche} onCheckedChange={(coche) => onSansFiche(coche === true)} />
        {t('noCustomer')}
      </label>
      {client === null && sansFiche ? champsSansFiche : null}
      {erreur ? (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Depuis une demande (`app-fil-commercial` a-1) : le bien et le demandeur dans UNE carte — le bien
 * se change (« changer » rouvre la recherche), le demandeur est repris de sa demande, verrouillé.
 */
export function CarteDeLaDemande({
  bien,
  onChangerDeBien,
  nom,
  telephone,
}: {
  /** `null` : « changer » a rouvert la recherche, rendue au-dessus ; la carte ne porte plus que le demandeur. */
  readonly bien: BienAPlanifier | null;
  readonly onChangerDeBien: () => void;
  readonly nom: string;
  readonly telephone?: string | null;
}) {
  const t = useTranslations('visitPlanning.plan');
  return (
    <div data-slot="carte-de-la-demande" className="divide-y divide-border rounded-xl border border-border bg-card">
      {bien ? (
      <div className="flex items-center gap-3 p-3">
        <Vignette src={bien.photo} className="size-14" />
        <span className="min-w-0 flex-1 leading-snug">
          <span className="block truncate text-corps font-semibold">{bien.libelle}</span>
          {bien.detail ? <span className="block truncate text-sm font-medium tabular-nums">{bien.detail}</span> : null}
        </span>
        <button
          type="button"
          onClick={onChangerDeBien}
          className="relative flex-none self-start rounded-sm text-ui font-medium text-primary outline-none after:absolute after:-inset-3 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring"
          aria-label={t('changeProperty')}
        >
          {t('changeLower')}
        </button>
      </div>
      ) : null}
      <div className="flex items-center gap-3 p-3">
        <Avatar size="40" aria-hidden="true">
          <AvatarFallback>{initialesDe({ first_name: nom.split(' ')[0] ?? null, last_name: nom.split(' ').slice(1).join(' ') || null }) ?? '?'}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 leading-snug">
          <span className="block truncate text-corps font-semibold">{nom}</span>
          <span className="block truncate text-ui tabular-nums text-muted-foreground">
            {[telephone ? formaterTelephone(telephone) : null, t('fromLead')].filter(Boolean).join(' · ')}
          </span>
        </span>
        <Lock className="size-4 flex-none text-muted-foreground" aria-label={t('lockedFromLead')} />
      </div>
    </div>
  );
}

/** La note de bas de la feuille d'une demande (a-1) : la visite naît confirmée, la demande est traitée. */
export function NoteDeLaDemande({ children }: { readonly children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-ui leading-snug text-muted-foreground">
      <CalendarCheck className="mt-0.5 size-4 flex-none" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** L'encart « la visite naît confirmée » (la maquette l'écrit à 85 % : encre pleine, TCK-658). */
export function EncartConfirmee({ children }: { readonly children: ReactNode }) {
  return (
    <p className="flex gap-2.5 rounded-xl bg-secondary p-3 text-sm leading-relaxed text-foreground">
      <Info className="mt-0.5 size-4 flex-none text-primary-deep" strokeWidth={1.75} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/* ───────────────────────────── le succès ───────────────────────────── */

export interface VisitePlanifiee {
  readonly id: number;
  /** Le jour `AAAA-MM-JJ` et l'heure murale `HH:MM` à Dakar. */
  readonly jour: string;
  readonly heure: string;
  readonly bien: BienAPlanifier;
  readonly visiteur: string | null;
  readonly prenom: string | null;
  readonly telephone: string | null;
  readonly smsRetenu: boolean;
  /** La fiche du client, quand il en a une (née de la demande, ou choisie). */
  readonly ficheId: number | null;
  /** Depuis une demande : la fiche est née d'elle (`create_customer`). */
  readonly ficheCreee: boolean;
}

function PhraseDuSms({ visite, avecAgenda }: { readonly visite: VisitePlanifiee; readonly avecAgenda: boolean }) {
  const t = useTranslations('visitPlanning.plan');
  const tSms = useTranslations('visitPlanning.smsWithheld');
  // Passe 3 (R1) — la visite est créée, mais le SMS au client a été retenu : l'agent le sait.
  if (visite.smsRetenu) {
    return (
      <p className="mt-1.5 max-w-75 text-corps text-foreground">
        <span className="font-medium">{tSms('title')}</span> {tSms('description')}
      </p>
    );
  }
  return (
    <p className="mt-1.5 max-w-75 text-corps text-muted-foreground">
      {visite.prenom ? t('successSms', { name: visite.prenom }) : t('successSmsAnonymous')}
      {avecAgenda ? ` ${t('successInAgenda')}` : null}
    </p>
  );
}

function Coche() {
  return (
    <span className="inline-flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
      <Check className="size-7" aria-hidden="true" />
    </span>
  );
}

/**
 * « Visite confirmée » — `app-visites` a-6 (la carte à vignette) ou, depuis une demande,
 * `app-fil-commercial` a-2 (la tuile du jour et ce qui a été fait). Le texte du SMS envoyé, que la
 * maquette a-2 montre, n'est pas rendu par l'API : il n'est pas inventé ici.
 */
export function SuccesDeLaPlanification({ visite, depuisUneDemande }: { readonly visite: VisitePlanifiee; readonly depuisUneDemande: boolean }) {
  const t = useTranslations('visitPlanning.plan');
  const locale = useLocale();
  const { quand, quandLong, jourDeSemaine, numeroDuJour } = libellesDuSucces(visite, locale);

  if (depuisUneDemande) {
    const fait = [
      visite.ficheCreee ? t('doneCustomerCreated') : null,
      t('doneLeadHandled'),
      t('doneInAgenda'),
    ].filter((x): x is string => x !== null);
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center pt-2 text-center">
          <Coche />
          <p role="status" className="mt-3 font-display text-affiche-22 font-semibold tracking-titre">
            {t('successTitle')}
          </p>
          <PhraseDuSms visite={visite} avecAgenda={false} />
        </div>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 p-3.5">
            <span className="flex size-12 flex-none flex-col items-center justify-center rounded-lg bg-secondary leading-none text-primary-deep">
              <span className="text-legende font-semibold uppercase">{jourDeSemaine}</span>
              <span className="font-display text-lg font-semibold tabular-nums">{numeroDuJour}</span>
            </span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-corps font-semibold tabular-nums">{quandLong}</span>
              <span className="block truncate text-ui text-muted-foreground">{visite.bien.libelle}</span>
            </span>
          </div>
          <ul className="space-y-2.5 p-3.5 text-sm">
            {fait.map((ligne) => (
              <li key={ligne} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 flex-none text-success" aria-hidden="true" />
                <span>{ligne}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center pt-7 text-center xl:pt-10">
      <Coche />
      <p role="status" className="mt-4 font-display text-2xl font-semibold tracking-titre">
        {t('successTitle')}
      </p>
      <PhraseDuSms visite={visite} avecAgenda />
      <div className="mt-6 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left">
        <Vignette src={visite.bien.photo} className="size-16 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-titre-court font-semibold tabular-nums">{quand}</p>
          <p className="truncate text-sm">{visite.bien.libelle}</p>
          {visite.visiteur ? <p className="truncate text-sm text-muted-foreground">{visite.visiteur}</p> : null}
        </div>
      </div>
    </div>
  );
}

function libellesDuSucces(visite: VisitePlanifiee, locale: string) {
  const jourCourt = jourEnClair(visite.jour, locale);
  const premier = jourCourt.charAt(0).toLocaleUpperCase() + jourCourt.slice(1);
  const semaine = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: FUSEAU_DES_VISITES }).format(new Date(`${visite.jour}T12:00:00Z`));
  return {
    quand: `${premier} · ${visite.heure}`,
    quandLong: `${jourEnToutesLettres(visite.jour, locale)}, ${visite.heure}`,
    jourDeSemaine: semaine,
    numeroDuJour: String(Number(visite.jour.slice(8, 10))),
  };
}

/**
 * Les gestes du succès. Hors demande (`app-visites` a-6) : dans le corps, sous la carte — Voir la
 * visite, WhatsApp, une autre visite, en grands boutons pleine largeur au téléphone comme au panneau.
 * Depuis une demande (`app-fil-commercial` a-2) : dans le pied — WhatsApp en tête, puis Voir la fiche
 * et Voir la visite, qu'AC4 exige et qui prend la place de « Demande suivante » (celle-ci vit avec la
 * boîte des demandes, TCK-2584).
 */
export function GestesDuSucces({
  visite,
  depuisUneDemande,
  messageWhatsApp,
  onAutreVisite,
  onFermer,
}: {
  readonly visite: VisitePlanifiee;
  readonly depuisUneDemande: boolean;
  readonly messageWhatsApp: string;
  readonly onAutreVisite: () => void;
  readonly onFermer: () => void;
}) {
  const t = useTranslations('visitPlanning.plan');
  // Au pied d'une demande, dès `xl` : la taille des boutons du pied du panneau.
  const auPied = depuisUneDemande ? 'xl:h-controle xl:px-3.5 xl:text-sm' : undefined;
  const styleDeLaVisite = depuisUneDemande ? cn(buttonVariants({ size: 'xl', variant: 'ghost' }), auPied) : cn(buttonVariants({ size: 'xl' }), 'w-full');
  const voirLaVisite = (
    <Link href={`/app/visits/${visite.id}`} onClick={onFermer} className={styleDeLaVisite}>
      {t('viewVisit')}
    </Link>
  );
  const whatsapp = visite.telephone ? (
    <a
      href={whatsappHref(visite.telephone, messageWhatsApp)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ size: 'xl', variant: 'outline' }),
        'w-full',
        depuisUneDemande && 'border-transparent bg-success text-success-foreground hover:bg-success/90 xl:w-auto',
        auPied,
      )}
    >
      <IconeWhatsApp className={depuisUneDemande ? undefined : 'text-success'} />
      {t('alsoWhatsApp')}
    </a>
  ) : null;

  if (!depuisUneDemande) {
    return (
      <div data-slot="gestes-du-succes" className="mt-6 w-full space-y-2">
        {voirLaVisite}
        {whatsapp}
        <button type="button" onClick={onAutreVisite} className={cn(buttonVariants({ size: 'xl', variant: 'ghost' }), 'w-full')}>
          {t('anotherVisit')}
        </button>
      </div>
    );
  }

  const fiche =
    visite.ficheId !== null ? (
      <Link
        href={`/app/customers/${visite.ficheId}`}
        onClick={onFermer}
        className={cn(buttonVariants({ size: 'xl', variant: 'outline' }), auPied)}
      >
        {t('viewCustomer')}
      </Link>
    ) : null;
  // Le bureau aligne à droite, dans l'ordre de la maquette : Voir la visite, Voir la fiche, WhatsApp.
  return (
    <div data-slot="gestes-du-succes" className="w-full space-y-2 xl:flex xl:flex-row-reverse xl:gap-2 xl:space-y-0">
      {whatsapp}
      <div className={cn('grid gap-2 xl:contents', fiche ? 'grid-cols-2' : 'grid-cols-1')}>
        {fiche}
        {voirLaVisite}
      </div>
    </div>
  );
}
