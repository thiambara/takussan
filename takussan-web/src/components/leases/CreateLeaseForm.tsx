'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useFormState, useWatch, type Control, type FieldPath } from 'react-hook-form';
import { FileSignature, Info } from 'lucide-react';
import { useApiForm } from '@/hooks/useApiForm';
import { useAvertissementDepart } from '@/hooks/useAvertissementDepart';
import { Button } from '@/components/ui/button';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormAmountInput,
  FormInput,
  FormSelect,
  FormTextarea,
  FormGlobalError,
} from '@/components/forms';
import { FormDatePicker } from '@/components/forms/FormDatePicker';
import {
  useCreateLease,
  useDemanderLaSignature,
  useLeaseCustomer,
  useLeaseCustomerOptions,
  useLeaseDefaults,
  useLeasePropertyOptions,
} from '@/lib/queries/leases';
import { useBooking } from '@/lib/queries/bookings';
import { createLeaseSchema, type CreateLeaseFormValues } from '@/lib/schemas/lease';
import { messageErreurApi } from '@/lib/api';
import { totalALEntreeDuBail } from '@/lib/cout-d-entree';
import { formatCurrency } from '@/lib/format';
import { DATE_COURTE, useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import type { Booking } from '@/types/booking';
import type { CustomerListItem } from '@/types/customer';
import type { LeaseDefaults, SourceDuDefaut } from '@/types/lease';
import type { PropertyListItem } from '@/types/property';
import { CreationRapideDuLocataire, type LocataireRetenu } from './creation/CreationRapideDuLocataire';
import { PasAPasDeMois } from './creation/PasAPasDeMois';
import { CarteDeRecapitulatif, ReglagesAppliques } from './creation/RecapitulatifDuBail';
import { ReperesDEtapes } from './creation/ReperesDEtapes';
import { SectionDuBail, TitreDeBloc } from './creation/SectionDuBail';
import { TotalALEntreeDuBail } from './creation/TotalALEntreeDuBail';

/**
 * ⚠ Ce formulaire emploie un VOCABULAIRE DIFFÉRENT de `LeaseDetail` pour le même enum
 * (« Location résidentielle » ici, « Bail d'habitation » là-bas). TCK-292 ne change AUCUN rendu :
 * les deux tables sont donc conservées telles quelles, sous `lease.form.typeOptions.*` et
 * `lease.types.*`. Les fusionner est une décision produit, pas un arbitrage de ce ticket.
 * TCK-2643 — le récapitulatif de l'étape « Vérifier » emploie `lease.types.*`, comme la maquette.
 */
const LEASE_TYPES = ['residential_rent', 'commercial_rent', 'seasonal_rent', 'sale'] as const;

const PAYMENT_FREQUENCIES = ['monthly', 'quarterly', 'yearly'] as const;

// TCK-084 — share the centralised currency catalogue.
import { CURRENCY_METADATA } from '@/lib/format/currency';

const CURRENCY_OPTIONS = (['XOF', 'EUR', 'USD', 'XAF'] as const).map((code) => ({
  value: code,
  label: `${code} (${CURRENCY_METADATA[code].symbol})`,
}));

const DEVISES = ['XOF', 'XAF', 'EUR', 'USD'] as const;

/**
 * TCK-2643 — les quatre étapes du téléphone, et les champs que « Continuer » valide avant de passer
 * à la suivante. L'étape « Vérifier » ne porte aucun champ : elle relit.
 */
const ETAPES = ['bien', 'locataire', 'conditions', 'verifier'] as const;
const CHAMPS_DES_ETAPES: readonly (readonly FieldPath<CreateLeaseFormValues>[])[] = [
  ['property_id'],
  ['tenant_id'],
  [
    'type',
    'start_date',
    'end_date',
    'monthly_rent',
    'sale_price',
    'monthly_charges',
    'deposit_amount',
    'currency',
    'payment_frequency',
    'payment_day',
    'late_fee_percent',
    'late_fee_grace_days',
    'early_termination_penalty_months',
    'terms',
    'special_conditions',
  ],
  [],
];
const ETAPE_VERIFIER = 3;

/** Les termes qu'une vente n'a pas : ni loyer, ni charges, ni pénalité de loyer, ni indemnité de départ. */
const TERMES_DE_LOCATION = ['monthly_rent', 'monthly_charges', 'late_fee_percent', 'late_fee_grace_days', 'early_termination_penalty_months'] as const;

interface CreateLeaseFormProps {
  /**
   * P48.03 (TCK-2352) — `/app/leases/new?booking_id=…` : le bail tiré d'une candidature. Le bien,
   * le locataire (le client de la réservation), les dates et le loyer se préremplissent, et
   * `booking_id` part avec le bail : l'API refuse un autre locataire, et passe la réservation à
   * `completed`, ce qui libère ses nuits.
   */
  readonly bookingId?: number;
  /**
   * TCK-2643 — `/app/leases/new?property=…` : venu de la fiche du bien (TCK-2639), le bien est
   * préchoisi. Retenu seulement s'il figure parmi les biens proposés : le formulaire n'envoie jamais
   * un bien que le sélecteur ne montre pas.
   */
  readonly propertyId?: number;
  /** TCK-2643 — `?customer=…` : le locataire préchoisi (lu par son identifiant, `useLeaseCustomer`). */
  readonly customerId?: number;
  /** Décision 8 — le personnel de l'agence crée un locataire sans quitter le bail. */
  readonly personnel?: boolean;
  /** Où ramène « ✕ » au téléphone (la fiche du bien quand on en vient). */
  readonly retour?: string;
}

export function CreateLeaseForm({ bookingId, propertyId, customerId, personnel = false, retour = '/app/leases' }: CreateLeaseFormProps = {}) {
  const commun = { personnel, retour, locatairePrechoisi: bookingId ? undefined : customerId };
  if (bookingId) {
    return <CreateLeaseFormDepuisReservation bookingId={bookingId} {...commun} />;
  }
  if (propertyId) {
    return <CreateLeaseFormDepuisBien propertyId={propertyId} {...commun} />;
  }
  return <FormulaireDuBail reservation={null} {...commun} />;
}

interface Commun {
  readonly personnel: boolean;
  readonly retour: string;
  readonly locatairePrechoisi?: number;
}

/** Attend les biens proposés avant de monter le formulaire : ses valeurs initiales ne se rejouent pas. */
function CreateLeaseFormDepuisBien({ propertyId, ...commun }: { readonly propertyId: number } & Commun) {
  const query = useLeasePropertyOptions();
  if (query.isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }
  const propose = (query.data?.data ?? []).some((bien) => bien.id === propertyId);
  return <FormulaireDuBail reservation={null} bienPrechoisi={propose ? propertyId : undefined} {...commun} />;
}

/** `useBooking` ne s'appelle que sur ce chemin : le formulaire vierge ne lit aucune réservation. */
function CreateLeaseFormDepuisReservation({ bookingId, ...commun }: { readonly bookingId: number } & Commun) {
  const t = useTranslations('lease.form');
  const query = useBooking(bookingId);
  if (query.isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }
  const reservation = query.data?.data;
  if (query.isError || !reservation) {
    return <ErrorState message={t('fromBookingError')} />;
  }
  return <FormulaireDuBail reservation={reservation} {...commun} />;
}

function valeursDeLaReservation(reservation: Booking): Partial<CreateLeaseFormValues> {
  const bien = reservation.property;
  const devise = DEVISES.find((code) => code === bien?.currency);
  return {
    property_id: reservation.property_id,
    tenant_id: reservation.customer_id,
    booking_id: reservation.id,
    start_date: reservation.start_date?.slice(0, 10) ?? '',
    end_date: reservation.end_date?.slice(0, 10) ?? '',
    ...(bien?.contract_type === 'rent' && typeof bien.price === 'number' ? { monthly_rent: bien.price } : {}),
    ...(devise ? { currency: devise } : {}),
  };
}

/**
 * TCK-2643 — ce que `GET /api/leases/defaults` préremplit, champ par champ. Une valeur absente
 * (`null` : un bien loué à l'année n'a pas de loyer mensuel) ne remplace rien.
 */
function valeursPreremplies(d: LeaseDefaults): [FieldPath<CreateLeaseFormValues>, unknown][] {
  const devise = DEVISES.find((code) => code === d.currency);
  const valeurs: [FieldPath<CreateLeaseFormValues>, unknown][] = [
    ['type', d.type],
    ['monthly_rent', d.monthly_rent?.value ?? 0],
    ['payment_day', d.payment_day.value],
    ['late_fee_percent', d.late_fee_percent.value],
    ['late_fee_grace_days', d.late_fee_grace_days.value],
    ['early_termination_penalty_months', d.early_termination_penalty_months.value],
  ];
  if (devise) valeurs.push(['currency', devise]);
  if (d.sale_price) valeurs.push(['sale_price', d.sale_price.value]);
  if (d.monthly_charges) valeurs.push(['monthly_charges', d.monthly_charges.value]);
  if (d.deposit_amount) valeurs.push(['deposit_amount', d.deposit_amount.value]);
  return valeurs;
}

/** « F » pour le franc CFA dans `/app` (TCK-2685), le symbole sinon. */
function symboleCourt(devise: string): string {
  if (devise === 'XOF' || devise === 'XAF') return 'F';
  return CURRENCY_METADATA[devise as keyof typeof CURRENCY_METADATA]?.symbol ?? devise;
}

type Envoi = { readonly id: number; readonly echec: string | null };

function FormulaireDuBail({
  reservation,
  bienPrechoisi,
  locatairePrechoisi,
  personnel,
  retour,
}: {
  readonly reservation: Booking | null;
  readonly bienPrechoisi?: number;
} & Commun) {
  const t = useTranslations('lease.form');
  const tLease = useTranslations('lease');
  const tRacine = useTranslations();
  const f = useFormatteurs();
  const router = useRouter();
  const idFormulaire = `nouveau-bail-${useId().replace(/:/g, '')}`;
  const createLease = useCreateLease();
  const demanderLaSignature = useDemanderLaSignature();
  const [customerSearch, setCustomerSearch] = useState('');
  const propertiesQuery = useLeasePropertyOptions();
  const customersQuery = useLeaseCustomerOptions(customerSearch);
  const [locataireConnu, setLocataireConnu] = useState<LocataireRetenu | null>(null);
  // La REF décide de l'envoi (le clic précède l'envoi dans le même évènement : un état n'y serait pas
  // encore lu) ; l'ÉTAT nomme le bouton qui attend.
  const intention = useRef<'brouillon' | 'signature'>('brouillon');
  const [intentionAffichee, setIntentionAffichee] = useState<'brouillon' | 'signature'>('brouillon');
  const [bailCree, setBailCree] = useState<{ readonly id: number; readonly message: string } | null>(null);
  // Au téléphone, on entre à la première étape qui reste à faire : un bien venu de sa fiche saute
  // « Bien », une réservation (bien ET locataire) va droit aux conditions.
  const [etape, setEtape] = useState(
    reservation ? 2 : bienPrechoisi ? (locatairePrechoisi ? 2 : 1) : 0,
  );

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<CreateLeaseFormValues, Envoi>({
    schema: createLeaseSchema,
    defaultValues: {
      property_id: 0,
      tenant_id: 0,
      type: 'residential_rent',
      start_date: '',
      end_date: '',
      monthly_rent: 0,
      deposit_amount: 0,
      currency: 'XOF',
      payment_frequency: 'monthly',
      payment_day: 1,
      terms: '',
      special_conditions: '',
      ...(bienPrechoisi ? { property_id: bienPrechoisi } : {}),
      ...(locatairePrechoisi ? { tenant_id: locatairePrechoisi } : {}),
      ...(reservation ? valeursDeLaReservation(reservation) : {}),
    },
    onSubmit: async (values) => {
      // Une vente n'emporte aucun terme de location, même prérempli.
      const corps = values.type === 'sale'
        ? { ...values, ...Object.fromEntries(TERMES_DE_LOCATION.map((nom) => [nom, undefined])) }
        : values;
      const cree = await createLease.mutateAsync(corps);
      const id = cree.data.id;
      if (intention.current !== 'signature') return { id, echec: null };
      // « Envoyer à la signature » = le brouillon, PUIS la demande de signature. Un échec de la
      // seconde laisse le brouillon : il ne se recrée jamais (aucun second POST).
      try {
        await demanderLaSignature.mutateAsync({ leaseId: id });
        return { id, echec: null };
      } catch (erreur) {
        return { id, echec: messageErreurApi(erreur, tRacine, t('signature.echecInconnu')) };
      }
    },
    onSuccess: (envoi) => {
      if (envoi.echec !== null) {
        setBailCree({ id: envoi.id, message: envoi.echec });
        return;
      }
      router.push(`/app/leases/${envoi.id}`);
    },
  });

  // P08.06 (TCK-755) — avertir avant de quitter la page, seulement quand le formulaire est modifié.
  // `useFormState` et non `form.formState` lu au rendu : compilé, la lecture resterait figée (TCK-571).
  // Le brouillon créé (signature en échec), il n'y a plus rien à perdre.
  const { isDirty } = useFormState({ control: form.control });
  useAvertissementDepart(isDirty && bailCree === null);

  const customerLabel = (customer: CustomerListItem | LocataireRetenu) =>
    formatCustomerLabel(customer, (id) => t('customerFallback', { id: String(id) }));

  const leaseTypeOptions = LEASE_TYPES.map((value) => ({
    value,
    label: t(`typeOptions.${value}`),
  }));
  const paymentFrequencyOptions = PAYMENT_FREQUENCIES.map((value) => ({
    value,
    label: t(`frequencyOptions.${value}`),
  }));

  // TCK-571 — `useWatch`, jamais `form.watch()` lu pendant le rendu. Compilé, `form.watch('type')`
  // était mis en cache sur l'identité — stable — de `form` : un bail passé en « Vente » gardait le
  // champ « Loyer mensuel », et le récapitulatif ne nommait jamais le bien choisi (TCK-564).
  const [
    type,
    selectedPropertyId,
    selectedTenantId,
    currency,
    loyer,
    charges,
    caution,
    jour,
    taux,
    delai,
    indemnite,
    debut,
    fin,
    prixDeVente,
  ] = useWatch({
    control: form.control,
    name: [
      'type',
      'property_id',
      'tenant_id',
      'currency',
      'monthly_rent',
      'monthly_charges',
      'deposit_amount',
      'payment_day',
      'late_fee_percent',
      'late_fee_grace_days',
      'early_termination_penalty_months',
      'start_date',
      'end_date',
      'sale_price',
    ],
  });
  const isSale = type === 'sale';
  const devise = currency ?? 'XOF';
  const symbole = symboleCourt(devise);

  const properties = useMemo(() => {
    // TCK-2643 — les biens VACANTS d'abord (TCK-2637), dans l'ordre du titre.
    const biens = propertiesQuery.data?.data ?? [];
    return [...biens].sort((a, b) => Number(b.occupancy?.state === 'vacant') - Number(a.occupancy?.state === 'vacant'));
  }, [propertiesQuery.data]);
  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const aucunBien = !propertiesQuery.isLoading && properties.length === 0;
  const aucunLocataire = !customersQuery.isLoading && customers.length === 0;
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null;

  // Le locataire retenu : dans la liste proposée, créé ou choisi ici, sinon lu par son identifiant
  // (`?customer=`, la réservation, une fiche proposée au doublon).
  const dansLaListe = customers.find((c) => c.id === selectedTenantId) ?? null;
  const connu = locataireConnu?.id === selectedTenantId ? locataireConnu : null;
  const locataireQuery = useLeaseCustomer(selectedTenantId > 0 && !dansLaListe && !connu ? selectedTenantId : 0);
  const lu = locataireQuery.data?.data?.id === selectedTenantId ? locataireQuery.data.data : null;
  const selectedCustomer: CustomerListItem | LocataireRetenu | null = dansLaListe ?? connu ?? lu;
  const optionsDeLocataire = [
    ...customers,
    ...(selectedCustomer && !dansLaListe ? [selectedCustomer] : []),
  ];
  // Décision 8 — sans compte, le locataire ne peut pas signer en ligne : l'API refuserait (422).
  const sansCompte = selectedCustomer !== null && typeof selectedCustomer.user_id !== 'number';

  // TCK-2643 — le préremplissage : à l'arrivée des défauts du bien, ils deviennent les valeurs PAR
  // DÉFAUT du formulaire, et chaque champ que l'agent n'a pas touché les prend (`keepDirtyValues`) ;
  // une valeur saisie ne se réécrit jamais, celles de la réservation non plus. `reset` et non
  // `resetField` : ce dernier ignore un champ pas encore monté (le prix d'une vente, monté par le
  // type « Vente » prérempli au même passage). `keepDirty` : une saisie antérieure garde l'avertissement
  // de départ ; un formulaire intact reste intact.
  const defaultsQuery = useLeaseDefaults(selectedPropertyId);
  const defauts = defaultsQuery.data?.data?.property_id === selectedPropertyId ? defaultsQuery.data.data : null;
  useEffect(() => {
    if (!defauts) return;
    const deLaReservation = new Set(reservation ? Object.keys(valeursDeLaReservation(reservation)) : []);
    const preremplies = Object.fromEntries(valeursPreremplies(defauts).filter(([nom]) => !deLaReservation.has(nom)));
    form.reset({ ...form.formState.defaultValues, ...preremplies } as CreateLeaseFormValues, {
      keepDirtyValues: true,
      keepDirty: true,
      keepErrors: true,
      keepTouched: true,
      keepIsSubmitted: true,
      keepSubmitCount: true,
    });
  }, [defauts, form, reservation]);

  /** La source d'une valeur, tant qu'elle est celle qui a été préremplie. */
  const sourceDe = (
    nom: 'monthly_rent' | 'monthly_charges' | 'deposit_amount' | 'payment_day' | 'late_fee_percent' | 'early_termination_penalty_months',
    valeur: unknown,
  ): SourceDuDefaut | null => {
    const defaut = defauts?.[nom];
    return defaut && defaut.value === valeur ? defaut.source : null;
  };
  const aideDeSource = (source: SourceDuDefaut | null) => (source ? t(`source.${source}`) : undefined);

  const loyerSaisi = typeof loyer === 'number' && loyer > 0 ? loyer : null;
  const cautionSaisie = typeof caution === 'number' ? caution : null;
  const moisDeCaution =
    loyerSaisi !== null && cautionSaisie !== null && cautionSaisie % loyerSaisi === 0 ? cautionSaisie / loyerSaisi : null;
  const plancherDeCaution = loyerSaisi !== null && cautionSaisie !== null ? Math.floor(cautionSaisie / loyerSaisi) : 0;

  const total = isSale
    ? null
    : totalALEntreeDuBail({
        loyer: loyerSaisi,
        charges: typeof charges === 'number' ? charges : null,
        caution: cautionSaisie,
        moisDAvance: defauts?.advance_months?.value,
        moisDeFrais: defauts?.agency_fee_months?.value,
        devise,
      });

  const commission = defauts?.agency_commission_rate?.value ?? null;
  const reglagesDeLAgence = [defauts?.late_fee_percent, defauts?.late_fee_grace_days, defauts?.early_termination_penalty_months].some(
    (d) => d?.source === 'agency',
  );
  const candidatures = (defauts?.open_applications ?? []).filter((a) => a.customer_id !== selectedTenantId).length;

  const nomDuBailleur = (() => {
    const titulaire = selectedProperty?.owner ?? null;
    return titulaire ? nomAffichable({ id: titulaire.id }, titulaire.name) : null;
  })();
  const nomDuLocataire = selectedCustomer ? nomDuClient(selectedCustomer, (id) => t('customerFallback', { id: String(id) })) : null;
  const titreDuBien = selectedProperty?.title ?? reservation?.property?.title ?? null;

  const valeurDePenalite =
    typeof taux === 'number' && taux > 0
      ? t('valeurs.penalite', { taux: f.nombre(taux), jours: typeof delai === 'number' ? delai : 0 })
      : t('valeurs.sansPenalite');

  const nomsDesEtapes = ETAPES.map((cle) => t(`etapes.${cle}`));
  const etapeMin = 0;

  const continuer = async () => {
    const valide = await form.trigger([...CHAMPS_DES_ETAPES[etape]]);
    if (!valide) return;
    // Une réservation porte le bien ET le locataire : l'étape « Locataire » n'a rien à montrer.
    setEtape((e) => (reservation && e === 0 ? 2 : Math.min(ETAPE_VERIFIER, e + 1)));
    window.scrollTo?.({ top: 0 });
  };
  const revenir = () => {
    setEtape((e) => (reservation && e === 2 ? 0 : Math.max(etapeMin, e - 1)));
    window.scrollTo?.({ top: 0 });
  };

  const envoyer = async (event: React.FormEvent<HTMLFormElement>) => {
    await handleSubmit(event);
    // Une erreur (du schéma ou d'un 422) ramène, au téléphone, à l'étape qui porte le champ.
    const erreurs = form.formState.errors;
    const premiere = CHAMPS_DES_ETAPES.findIndex((champs) => champs.some((nom) => erreurs[nom]));
    if (premiere >= 0) setEtape(premiere);
  };

  const boutonsDEnvoi = (dansLaBarre: boolean) => (
    <>
      <Button
        type="submit"
        form={idFormulaire}
        className={dansLaBarre ? 'w-full gap-2 font-semibold' : 'h-11 w-full gap-2'}
        disabled={isSubmitting || sansCompte || bailCree !== null}
        onClick={() => {
          intention.current = 'signature';
          setIntentionAffichee('signature');
        }}
      >
        <FileSignature className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {isSubmitting && intentionAffichee === 'signature' ? t('envoiEnCours') : t('envoyerALaSignature')}
      </Button>
      <Button
        type="submit"
        form={idFormulaire}
        variant="outline"
        className={dansLaBarre ? 'w-full' : 'h-11 w-full'}
        disabled={isSubmitting || bailCree !== null}
        onClick={() => {
          intention.current = 'brouillon';
          setIntentionAffichee('brouillon');
        }}
      >
        {isSubmitting && intentionAffichee === 'brouillon' ? t('creating') : t('creerLeBrouillon')}
      </Button>
    </>
  );

  const avisDEnvoi = (
    <div className="space-y-2">
      {candidatures > 0 ? (
        <p className="flex gap-2.5 text-ui leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('candidatures', { count: candidatures })}
        </p>
      ) : null}
      {sansCompte && nomDuLocataire ? (
        <p className="flex gap-2.5 text-ui leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('signature.sansCompte', { nom: nomDuLocataire })}
        </p>
      ) : (
        <p className="flex gap-2.5 text-ui leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('signature.aide')}
        </p>
      )}
    </div>
  );

  return (
    <>
      <DeclarerEnTete
        forme="plein-ecran"
        titre={t('titre')}
        sousTitre={t('etapes.sousTitre', { n: etape + 1, total: ETAPES.length, nom: nomsDesEtapes[etape] })}
        repli={retour}
      />
      <form
        id={idFormulaire}
        noValidate
        onSubmit={(e) => {
          void envoyer(e);
        }}
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_min(calc(var(--spacing)*100),36.5%)]"
      >
        {/* « Entrée » dans un champ n'envoie pas le bail (il partirait d'une étape, ou à la signature) :
            l'envoi implicite passe par le PREMIER bouton d'envoi du formulaire, et celui-ci, désactivé,
            l'annule (HTML, « implicit submission »). */}
        <button type="submit" disabled hidden aria-hidden="true" tabIndex={-1} />
        <div className="min-w-0 space-y-4">
          <ReperesDEtapes etapes={nomsDesEtapes} courante={etape} libelle={t('etapes.libelle')} className="md:hidden" />

          <FormGlobalError>{globalError}</FormGlobalError>

          {bailCree ? (
            <div role="alert" className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="text-foreground">{t('signature.echec', { message: bailCree.message })}</p>
              <Link href={`/app/leases/${bailCree.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {t('signature.ouvrirLeBrouillon')}
              </Link>
            </div>
          ) : null}

          {/* ── 1. Le bien ─────────────────────────────────────────────────────────────────── */}
          <SectionDuBail n={1} titre={t('sections.bien')} faite={selectedPropertyId > 0} cachee={etape !== 0}>
            {reservation ? (
              <PartiesDeLaReservation
                reservation={reservation}
                titulaire={properties.find((p) => p.id === reservation.property_id)?.owner ?? null}
              />
            ) : (
              <div className="space-y-4">
                <EntitySelect
                  control={form.control}
                  name="property_id"
                  label={t('property')}
                  placeholder={propertiesQuery.isLoading ? t('loadingProperties') : t('selectProperty')}
                  options={properties.map((property) => ({
                    value: property.id,
                    label: formatPropertyLabel(property),
                  }))}
                  required
                />
                {aucunBien ? (
                  // TCK-776 (P15.09) — une liste vide se dit, et mène à ce qui la remplit.
                  <div className="space-y-2 rounded-lg border border-dashed border-border p-4 text-sm">
                    <p className="text-muted-foreground">{t('emptyProperties')}</p>
                    <Link href="/app/properties/new" className="font-medium text-primary underline-offset-4 hover:underline">
                      {t('createProperty')}
                    </Link>
                  </div>
                ) : null}
                <div className="rounded-lg bg-muted/50 p-4 text-sm">
                  <SummaryBlock
                    label={t('selectedProperty')}
                    value={
                      selectedProperty
                        ? `${selectedProperty.title} · ${selectedProperty.reference_number ?? `#${selectedProperty.id}`}`
                        : t('noPropertySelected')
                    }
                    detail={
                      selectedProperty && typeof selectedProperty.price === 'number'
                        ? formatCurrency(selectedProperty.price, 'fr', { currency: selectedProperty.currency ?? 'XOF' })
                        : undefined
                    }
                  />
                </div>
              </div>
            )}
          </SectionDuBail>

          {/* ── 2. Le locataire ────────────────────────────────────────────────────────────── */}
          {reservation ? null : (
            <SectionDuBail n={2} titre={t('sections.locataire')} faite={selectedTenantId > 0} cachee={etape !== 1}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="tenant-search" className="block text-sm font-medium">
                    {t('tenant')}
                    <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
                  </label>
                  <Input
                    id="tenant-search"
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder={t('tenantSearchPlaceholder')}
                  />
                  <EntitySelect
                    control={form.control}
                    name="tenant_id"
                    label={null}
                    ariaLabel={t('tenant')}
                    placeholder={customersQuery.isLoading ? t('searching') : t('selectTenant')}
                    options={optionsDeLocataire.map((customer) => ({
                      value: customer.id,
                      label: customerLabel(customer),
                    }))}
                    onChoisi={(id) => setLocataireConnu(customers.find((c) => c.id === id) ?? null)}
                    required
                  />
                </div>
                {personnel ? (
                  <CreationRapideDuLocataire
                    onCree={(locataire) => {
                      setLocataireConnu(locataire);
                      form.setValue('tenant_id', locataire.id, { shouldDirty: true, shouldValidate: true });
                    }}
                    onChoisi={(id) => {
                      setLocataireConnu(null);
                      form.setValue('tenant_id', id, { shouldDirty: true, shouldValidate: true });
                    }}
                  />
                ) : null}
                {aucunLocataire && !personnel ? (
                  <div className="space-y-2 rounded-lg border border-dashed border-border p-4 text-sm">
                    <p className="text-muted-foreground">{t('emptyTenants')}</p>
                    <Link href="/app/customers/new" className="font-medium text-primary underline-offset-4 hover:underline">
                      {t('addTenant')}
                    </Link>
                  </div>
                ) : null}
                <div className="rounded-lg bg-muted/50 p-4 text-sm">
                  <SummaryBlock
                    label={t('selectedTenant')}
                    value={selectedCustomer ? customerLabel(selectedCustomer) : t('noTenantSelected')}
                    detail={
                      // TCK-997 (P50.01) — le bail naît au nom du TITULAIRE du bien (`LeaseService::create`,
                      // `landlord_id = property.user_id`), jamais de qui le saisit : la ligne le nomme.
                      selectedProperty?.owner
                        ? t('landlordOfProperty', {
                            name: nomAffichable({ id: selectedProperty.owner.id }, selectedProperty.owner.name),
                          })
                        : t('landlordPending')
                    }
                  />
                </div>
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  {t('guarantorsHint')}
                </p>
              </div>
            </SectionDuBail>
          )}

          {/* ── 3. Les conditions ──────────────────────────────────────────────────────────── */}
          <SectionDuBail n={reservation ? 2 : 3} titre={t('sections.conditions')} cachee={etape !== 2}>
            <div className="space-y-4">
              {etape === 2 && titreDuBien ? (
                // Au téléphone, le rappel du bail en cours (maquette `ContexteBail`).
                <div className="rounded-xl bg-muted/60 p-3 leading-snug md:hidden">
                  <p className="truncate text-sm font-semibold">
                    {titreDuBien}
                    {' · '}
                    {selectedProperty?.reference_number ?? `#${selectedPropertyId}`}
                  </p>
                  <p className="truncate text-ui text-muted-foreground">
                    {t('contexte', { locataire: nomDuLocataire ?? '—', bailleur: nomDuBailleur ?? '—' })}
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <FormSelect<CreateLeaseFormValues>
                  control={form.control}
                  name="type"
                  label={t('typeDeBail')}
                  options={leaseTypeOptions}
                  required
                  containerClassName="max-lg:col-span-2"
                />
                <FormDatePicker<CreateLeaseFormValues> control={form.control} name="start_date" label={t('debut')} required />
                <div>
                  <FormDatePicker<CreateLeaseFormValues> control={form.control} name="end_date" label={t('fin')} />
                  <p className="mt-1 text-xs text-muted-foreground">{t('finAide')}</p>
                </div>
              </div>

              <TitreDeBloc className="pt-1 md:sr-only">{t('loyerEtCharges')}</TitreDeBloc>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {isSale ? (
                  <FormAmountInput<CreateLeaseFormValues>
                    control={form.control}
                    name="sale_price"
                    label={t('salePrice')}
                    currency={devise}
                    unite={symbole}
                    required
                  />
                ) : (
                  <div>
                    <FormAmountInput<CreateLeaseFormValues>
                      control={form.control}
                      name="monthly_rent"
                      label={t('loyer')}
                      currency={devise}
                      unite={t('unites.parMois', { symbole })}
                      required
                    />
                    <AideDuLoyer
                      source={sourceDe('monthly_rent', loyer)}
                      prix={defauts?.monthly_rent ? null : defauts?.property_price ?? null}
                      devise={devise}
                    />
                  </div>
                )}
                {isSale ? null : (
                  <div>
                    <FormAmountInput<CreateLeaseFormValues>
                      control={form.control}
                      name="monthly_charges"
                      label={t('charges')}
                      currency={devise}
                      unite={t('unites.parMois', { symbole })}
                    />
                    <Aide>{aideDeSource(sourceDe('monthly_charges', charges))}</Aide>
                  </div>
                )}
                <div className={isSale ? undefined : 'md:col-span-2 lg:col-span-1'}>
                  <label htmlFor="field-deposit_amount" className="mb-1.5 block text-sm font-medium">
                    {t('deposit')}
                    <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
                  </label>
                  <div className={isSale ? undefined : 'grid grid-cols-[calc(var(--spacing)*35)_minmax(0,1fr)] items-start gap-3 lg:grid-cols-1 lg:gap-1.5'}>
                    {isSale ? null : (
                      <PasAPasDeMois
                        mois={moisDeCaution}
                        plancher={plancherDeCaution}
                        libelleMois={moisDeCaution === null ? null : t('valeurs.mois', { count: moisDeCaution })}
                        libelleMoins={t('caution.moins')}
                        libellePlus={t('caution.plus')}
                        desactive={loyerSaisi === null}
                        onChange={(mois) => {
                          if (loyerSaisi === null) return;
                          form.setValue('deposit_amount', mois * loyerSaisi, { shouldDirty: true, shouldValidate: true });
                        }}
                      />
                    )}
                    <div className="flex items-start gap-2">
                      {isSale ? null : (
                        <span aria-hidden="true" className="flex h-11 items-center text-corps">
                          =
                        </span>
                      )}
                      <FormAmountInput<CreateLeaseFormValues>
                        control={form.control}
                        name="deposit_amount"
                        currency={devise}
                        unite={symbole}
                        required
                      />
                    </div>
                  </div>
                  <Aide>{aideDeSource(sourceDe('deposit_amount', caution))}</Aide>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <FormSelect<CreateLeaseFormValues>
                  control={form.control}
                  name="currency"
                  label={t('currency')}
                  options={CURRENCY_OPTIONS}
                />
                <FormSelect<CreateLeaseFormValues>
                  control={form.control}
                  name="payment_frequency"
                  label={t('frequency')}
                  options={paymentFrequencyOptions}
                />
              </div>

              <TitreDeBloc className="pt-1 md:sr-only">{t('reglesDuBail')}</TitreDeBloc>
              {defauts && !isSale ? (
                <ReglagesAppliques
                  titre={reglagesDeLAgence ? t('reglages.agence') : t('reglages.plateforme')}
                  detail={commission !== null ? t('reglages.detailAvecCommission') : t('reglages.detail')}
                  className="md:mt-1"
                />
              ) : null}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div>
                  <FormInput<CreateLeaseFormValues>
                    control={form.control}
                    name="payment_day"
                    type="number"
                    inputMode="numeric"
                    label={t('echeance')}
                    min={1}
                    max={28}
                  />
                  <Aide>{aideDeSource(sourceDe('payment_day', jour)) ?? t('echeanceAide')}</Aide>
                </div>
                {isSale ? null : (
                  <div role="group" aria-labelledby={`${idFormulaire}-penalite`}>
                    <p id={`${idFormulaire}-penalite`} className="mb-1.5 text-sm font-medium">
                      {t('penalite.titre')}
                    </p>
                    <div className="flex items-start gap-1.5">
                      <FormInput<CreateLeaseFormValues>
                        control={form.control}
                        name="late_fee_percent"
                        type="number"
                        inputMode="decimal"
                        aria-label={t('penalite.taux')}
                        min={0}
                        max={50}
                        trailing={<span aria-hidden="true" className="text-sm">%</span>}
                      />
                      <FormInput<CreateLeaseFormValues>
                        control={form.control}
                        name="late_fee_grace_days"
                        type="number"
                        inputMode="numeric"
                        aria-label={t('penalite.delai')}
                        min={0}
                        max={30}
                        trailing={<span aria-hidden="true" className="text-sm">{t('unites.jours')}</span>}
                      />
                    </div>
                    <Aide>{aideDeSource(sourceDe('late_fee_percent', taux))}</Aide>
                  </div>
                )}
                {commission !== null ? (
                  <div>
                    <p className="mb-1.5 text-sm font-medium">{t('commission.titre')}</p>
                    <p className="flex h-11 items-center rounded-lg border border-border bg-muted/40 px-3 text-corps tabular-nums">
                      {f.pourcentage(commission / 100, { maximumFractionDigits: 2 })}
                    </p>
                    <Aide>{t('commission.aide')}</Aide>
                  </div>
                ) : null}
                {isSale ? null : (
                  <div>
                    <FormInput<CreateLeaseFormValues>
                      control={form.control}
                      name="early_termination_penalty_months"
                      type="number"
                      inputMode="numeric"
                      label={t('indemnite.titre')}
                      min={0}
                      max={12}
                      trailing={<span aria-hidden="true" className="text-sm">{t('unites.mois')}</span>}
                    />
                    <Aide>{aideDeSource(sourceDe('early_termination_penalty_months', indemnite)) ?? t('indemnite.aide')}</Aide>
                  </div>
                )}
              </div>
            </div>
          </SectionDuBail>

          {/* ── 4. Les clauses (au téléphone, avec les conditions) ────────────────────────── */}
          <SectionDuBail n={reservation ? 3 : 4} titre={t('sections.clauses')} cachee={etape !== 2}>
            <div className="space-y-4">
              <FormTextarea<CreateLeaseFormValues> control={form.control} name="terms" label={tLease('terms')} rows={4} />
              <FormTextarea<CreateLeaseFormValues>
                control={form.control}
                name="special_conditions"
                label={tLease('specialConditions')}
                placeholder={t('clausesParticulieresAide')}
                rows={3}
              />
            </div>
          </SectionDuBail>

          {/* ── Téléphone : 4. Vérifier ────────────────────────────────────────────────────── */}
          {etape === ETAPE_VERIFIER ? (
            <div className="space-y-3 md:hidden">
              <TotalALEntreeDuBail total={total} prixDeVente={isSale ? (prixDeVente ?? null) : undefined} devise={devise} />
              <CarteDeRecapitulatif
                titre={t('recap.parties')}
                modifier={t('recap.modifier')}
                onModifier={() => setEtape(0)}
                lignes={[
                  { cle: t('recap.bien'), valeur: titreDuBien ?? '—' },
                  { cle: t('recap.locataire'), valeur: nomDuLocataire ?? '—' },
                  { cle: t('recap.bailleur'), valeur: nomDuBailleur ?? '—' },
                ]}
              />
              <CarteDeRecapitulatif
                titre={t('recap.conditions')}
                modifier={t('recap.modifier')}
                onModifier={() => setEtape(2)}
                lignes={[
                  { cle: t('recap.type'), valeur: tLease(`types.${type}`) },
                  {
                    cle: t('recap.duree'),
                    valeur: fin
                      ? t('valeurs.duree', { debut: f.date(debut, DATE_COURTE), fin: f.date(fin, DATE_COURTE) })
                      : t('valeurs.dureeSansFin', { debut: f.date(debut, DATE_COURTE) }),
                  },
                  ...(isSale
                    ? [{ cle: t('recap.prixDeVente'), valeur: f.montantCourt(prixDeVente ?? null, devise) }]
                    : [
                        { cle: t('recap.loyer'), valeur: t('valeurs.parMois', { montant: f.montantCourt(loyerSaisi, devise) }) },
                        { cle: t('recap.charges'), valeur: t('valeurs.parMois', { montant: f.montantCourt(typeof charges === 'number' ? charges : 0, devise) }) },
                      ]),
                  {
                    cle: t('recap.caution'),
                    valeur:
                      moisDeCaution !== null && moisDeCaution > 0
                        ? t('valeurs.caution', { mois: t('valeurs.mois', { count: moisDeCaution }), montant: f.montantCourt(cautionSaisie, devise) })
                        : f.montantCourt(cautionSaisie ?? 0, devise),
                  },
                  { cle: t('recap.echeance'), valeur: t('valeurs.echeance', { jour: typeof jour === 'number' ? jour : 1 }) },
                  ...(isSale
                    ? []
                    : [
                        { cle: t('recap.penalite'), valeur: valeurDePenalite },
                        ...(commission !== null ? [{ cle: t('recap.commission'), valeur: f.pourcentage(commission / 100, { maximumFractionDigits: 2 }) }] : []),
                        { cle: t('recap.indemnite'), valeur: t('valeurs.mois', { count: typeof indemnite === 'number' ? indemnite : 0 }) },
                      ]),
                ]}
              />
              <div className="px-1">{avisDEnvoi}</div>
            </div>
          ) : null}
        </div>

        {/* ── Bureau : la colonne du total et des deux envois (collante dès `xl`) ──────────── */}
        <aside className="space-y-4 max-md:hidden xl:sticky xl:top-6">
          <TotalALEntreeDuBail total={total} prixDeVente={isSale ? (prixDeVente ?? null) : undefined} devise={devise} />
          {avisDEnvoi}
          <div className="space-y-2">{boutonsDEnvoi(false)}</div>
        </aside>
      </form>

      {/* ── Téléphone : « Retour » / « Continuer », puis les deux envois ────────────────────── */}
      {etape < ETAPE_VERIFIER ? (
        <BarreDAction secondaire={etape > etapeMin ? 'premier' : undefined}>
          {etape > etapeMin ? (
            <Button type="button" variant="outline" className="px-4" onClick={revenir}>
              {t('retour')}
            </Button>
          ) : null}
          <Button type="button" className="font-semibold" onClick={() => void continuer()}>
            {t('continuer')}
          </Button>
        </BarreDAction>
      ) : (
        <BarreDAction className="flex-col">{boutonsDEnvoi(true)}</BarreDAction>
      )}
    </>
  );
}

/** Une ligne d'aide sous un champ (sa source, ou ce qu'il attend). */
function Aide({ children }: { readonly children?: string }) {
  return children ? <p className="mt-1 text-xs text-muted-foreground">{children}</p> : null;
}

/**
 * Sous le loyer : « Loyer annoncé sur la fiche du bien » tant qu'il est repris, ou — un bien loué à
 * une autre période que le mois ne préremplit rien (décision 9) — le prix annoncé et sa période.
 */
function AideDuLoyer({
  source,
  prix,
  devise,
}: {
  readonly source: SourceDuDefaut | null;
  readonly prix: LeaseDefaults['property_price'];
  readonly devise: string;
}) {
  const t = useTranslations('lease.form');
  const { montantCourt } = useFormatteurs();
  if (source === 'property') return <Aide>{t('loyerAnnonce')}</Aide>;
  if (prix && prix.contract_type === 'rent' && prix.period && prix.period !== 'monthly') {
    return (
      <Aide>
        {t('prixAnnonce', { montant: montantCourt(prix.amount, devise), periode: t(`periodes.${prix.period as 'daily' | 'weekly' | 'yearly'}`) })}
      </Aide>
    );
  }
  return null;
}

/**
 * `titulaire` vient des options de bien du formulaire (`include=owner`, TCK-997) : la lecture de la
 * réservation ne charge pas le titulaire du bien, et le bail naît à son nom, pas à celui de qui le
 * saisit. Un bien hors de ces options laisse la ligne en attente, comme le formulaire vierge.
 */
function PartiesDeLaReservation({
  reservation,
  titulaire,
}: {
  readonly reservation: Booking;
  readonly titulaire: PropertyListItem['owner'] | null;
}) {
  const t = useTranslations('lease.form');
  const bien = reservation.property;
  const client = reservation.customer;
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">
        {t('fromBooking', { reference: reservation.reference_number ?? `#${reservation.id}` })}
      </p>
      <div className="grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
        <SummaryBlock
          label={t('selectedProperty')}
          value={bien?.title ?? `#${reservation.property_id}`}
          detail={
            bien && typeof bien.price === 'number'
              ? formatCurrency(bien.price, 'fr', { currency: bien.currency ?? 'XOF' })
              : undefined
          }
        />
        <SummaryBlock
          label={t('selectedTenant')}
          value={nomAffichable(
            { id: reservation.customer_id, first_name: client?.first_name, last_name: client?.last_name },
            t('customerFallback', { id: String(reservation.customer_id) }),
          )}
          detail={
            titulaire
              ? t('landlordOfProperty', { name: nomAffichable({ id: titulaire.id }, titulaire.name) })
              : t('landlordPending')
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('fromBookingHint')}</p>
      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{t('guarantorsHint')}</p>
    </div>
  );
}

type EntityOption = { value: number; label: string };

function EntitySelect({
  control,
  name,
  label,
  ariaLabel,
  placeholder,
  options,
  onChoisi,
  required,
}: {
  control: Control<CreateLeaseFormValues>;
  name: 'property_id' | 'tenant_id';
  label: string | null;
  /**
   * Nom accessible du déclencheur quand `label` est `null` : sans lui, le choix n'a aucun nom
   * (TCK-1030, axe `button-name`).
   */
  ariaLabel?: string;
  placeholder: string;
  options: readonly EntityOption[];
  /** Après un choix : le formulaire garde l'élément choisi, même sorti de la liste (recherche). */
  onChoisi?: (id: number) => void;
  required?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="w-full">
          {label ? (
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
              {label}
              {required ? <span aria-hidden="true" className="ml-0.5 text-destructive">*</span> : null}
            </label>
          ) : null}
          <Select
            value={field.value ? String(field.value) : ''}
            onValueChange={(value) => {
              field.onChange(Number(value));
              onChoisi?.(Number(value));
            }}
            items={options.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
          >
            <SelectTrigger
              id={id}
              className="w-full"
              aria-label={label ? undefined : ariaLabel}
              aria-invalid={Boolean(fieldState.error) || undefined}
              aria-describedby={fieldState.error ? `${id}-error` : undefined}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldState.error ? (
            <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

function SummaryBlock({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function formatPropertyLabel(property: PropertyListItem): string {
  const ref = property.reference_number ? `${property.reference_number} · ` : '';
  const price =
    typeof property.price === 'number'
      ? ` · ${formatCurrency(property.price, 'fr', { currency: property.currency ?? 'XOF' })}`
      : '';
  return `${ref}${property.title}${price}`;
}

/** Le nom seul d'un client (repli « Client #<id> »). */
function nomDuClient(
  customer: CustomerListItem | LocataireRetenu,
  fallback: (id: number) => string,
): string {
  return (
    customer.full_name ||
    nomAffichable({ id: customer.id, first_name: customer.first_name, last_name: customer.last_name }, fallback(customer.id))
  );
}

/**
 * Le repli d'un locataire sans nom : « Client #<id> » en français depuis P06.06 (TCK-2336).
 * TCK-292 avait gardé au dictionnaire l'anglais `Customer #<id>` qui était en dur ; la valeur `wo`
 * le porte encore, le wolof étant en pause.
 */
function formatCustomerLabel(
  customer: CustomerListItem | LocataireRetenu,
  fallback: (id: number) => string,
): string {
  // P220.03 (TCK-2281) — le nom seul : le contact suit déjà, il ne se répète pas en repli.
  const name = nomDuClient(customer, fallback);
  const contact = [customer.email, customer.phone].filter(Boolean).join(' · ');
  return contact ? `${name} · ${contact}` : name;
}
