'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Controller, useFormState } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  FormError,
  FormGlobalError,
  FormInput,
  FormSelect,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useAvertissementDepart } from '@/hooks/useAvertissementDepart';
import { ApiError } from '@/lib/api';
import { customerSettableStatusValues } from '@/lib/enums/customer';
import {
  CUSTOMER_LOCALE_DEFAULT,
  customerFormSchema,
  customerLocaleValues,
  customerStatusValues,
  idTypeValues,
  normaliseCustomerForm,
  sansCriteres,
  sansStatut,
  pipelineStageValues,
  seekingContractTypeValues,
  seekingPropertyTypeValues,
  type CustomerFormValues,
} from '@/lib/schemas/customer';
import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerDuplicateMatch,
} from '@/app/actions/dashboard-customers';
import type { CustomerDetail } from '@/types/customer';
import { localeDisplayLabel, type Locale } from '@/i18n/config';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { ChampsDeLaRecherche } from './creation/ChampsDeLaRecherche';
import { RevelationNumeroDePiece } from './RevelationNumeroDePiece';


/**
 * Customer create / edit form — TCK-042.
 */

interface CustomerFormProps {
  readonly mode: 'create' | 'edit';
  readonly customer?: CustomerDetail;
  readonly onSuccess?: (customer: CustomerDetail) => void;
  /**
   * TCK-2589 (lot D2) — `feuille` : « Modifier » de la fiche client, en sections repliables (Identité,
   * Contact, Ce qu'il cherche, Pièce), SANS l'étape (elle se change depuis l'en-tête de la fiche, 8a :
   * la charge envoyée n'en porte pas) et sans boutons — le pied du panneau les porte (`idDuFormulaire`).
   * `page` (défaut) : la forme d'avant, inchangée.
   */
  readonly forme?: 'page' | 'feuille';
  /** L'`id` du `<form>`, pour un bouton d'envoi posé hors de lui (`form=`). */
  readonly idDuFormulaire?: string;
  /** L'envoi en cours et la saisie modifiée, pour le pied et la garde de sortie du panneau. */
  readonly onEtat?: (etat: { readonly enCours: boolean; readonly modifie: boolean }) => void;
  /**
   * TCK-955 — l'admin (ou le super-admin) a le geste « Afficher » du numéro de pièce. L'API tranche
   * de toute façon : ce drapeau n'évite que de proposer un geste voué au refus.
   */
  readonly canRevealIdNumber?: boolean;
  /**
   * TCK-2581 — création PRÉREMPLIE : « Créer sa fiche » depuis la suite d'une visite d'un visiteur
   * sans fiche porte son nom et son téléphone. Ignoré en édition.
   */
  readonly initial?: { readonly first_name?: string; readonly last_name?: string; readonly phone?: string };
  /**
   * TCK-2716 — la visite d'où naît la fiche (`/app/customers/new?visite=<id>`, quand l'API rend
   * `abilities.create_customer`) : envoyée en `property_visit_id`, l'API l'y rattache. Ignorée en édition.
   */
  readonly visiteDOrigine?: number;
}

function toDefaults(customer?: CustomerDetail): CustomerFormValues {
  if (!customer) {
    return {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      occupation: '',
      pipeline_stage: 'lead',
      status: 'active',
      id_type: '',
      id_number: '',
      id_number_masked: null,
      locale: '',
      seeking_contract_type: '',
      budget_min: '',
      budget_max: '',
      seeking_property_types: [],
      seeking_cities: '',
      seeking_neighborhoods: '',
      min_bedrooms: '',
    };
  }
  // `decimal:2` rend « 300000.00 » : on l'affiche sans ses zéros.
  const montant = (v: string | null | undefined) => (v == null ? '' : String(Number(v)));
  return {
    first_name: customer.first_name ?? '',
    last_name: customer.last_name ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    occupation: customer.occupation ?? '',
    pipeline_stage: (customer.pipeline_stage ?? 'lead') as CustomerFormValues['pipeline_stage'],
    status: (customer.status ?? 'active') as CustomerFormValues['status'],
    id_type: (customer.id_type ?? '') as CustomerFormValues['id_type'],
    // TCK-953 — le numéro ne se relit plus : le champ part vide, le masque sert d'indication.
    id_number: '',
    id_number_masked: customer.id_number_masked ?? null,
    locale: customer.locale ?? '',
    seeking_contract_type: customer.seeking_contract_type ?? '',
    budget_min: montant(customer.budget_min),
    budget_max: montant(customer.budget_max),
    seeking_property_types: customer.seeking_property_types ?? [],
    seeking_cities: (customer.seeking_cities ?? []).join(', '),
    seeking_neighborhoods: (customer.seeking_neighborhoods ?? []).join(', '),
    min_bedrooms: customer.min_bedrooms == null ? '' : String(customer.min_bedrooms),
  };
}

/** TCK-2590 — les valeurs d'une fiche vierge, partagées avec la création en deux temps (`creation/`). */
export function valeursDeCreation(): CustomerFormValues {
  return toDefaults();
}

export function CustomerForm({
  mode,
  customer,
  onSuccess,
  forme = 'page',
  idDuFormulaire,
  onEtat,
  canRevealIdNumber = false,
  initial,
  visiteDOrigine,
}: CustomerFormProps) {
  const t = useTranslations('crm.form');
  const tCommon = useTranslations('common.actions');
  const tStage = useTranslations('crm.pipeline.stage');
  const tStatus = useTranslations('crm.customerStatus');
  const tIdType = useTranslations('crm.idTypes');
  const tCrm = useTranslations('agentCrm.form');
  const tPropertyType = useTranslations('property.types');
  const tContract = useTranslations('property.contractTypes');
  const router = useRouter();
  const locale = useLocale() as Locale;

  // TCK-591 — un 409 `customer.duplicate` n'est pas une erreur mais une aide : on montre la fiche
  // existante, et « Créer quand même » renvoie le même formulaire avec `allow_duplicate`.
  const [duplicates, setDuplicates] = useState<CustomerDuplicateMatch[] | null>(null);
  const allowDuplicate = useRef(false);

  // TCK-591 (verif-591 passe 2, N4) — l'API ne rend les critères qu'au personnel de l'agence de la
  // fiche. Une fiche lue sans eux (le bailleur qui l'a ajoutée) n'en montre pas la section et ne
  // les renvoie pas : vides, ils auraient effacé ceux de l'agent.
  const showsCriteria = mode === 'create' || (customer !== undefined && 'budget_max' in customer);

  // La donnée porte la CLÉ, le rendu la résout (patron TCK-286). Les tables
  // françaises de `./options` restent en place tant que `app/(dashboard)/app/
  // customers/[id]/page.tsx` — hors de ce lot — les importe.
  const pipelineStageOptions = pipelineStageValues.map((v) => ({ value: v, label: tStage(v) }));
  // TCK-1753 (P147.06) — l'édition ne pose que `active`/`inactive` ; le statut retiré qu'une fiche
  // porte déjà reste offert, pour qu'elle se renvoie inchangée (l'API l'accepte tel quel).
  const statutCourant = customer?.status;
  const customerStatusOptions = customerStatusValues
    .filter(
      (v) => (customerSettableStatusValues as readonly string[]).includes(v) || v === statutCourant,
    )
    .map((v) => ({ value: v, label: tStatus(v) }));
  const idTypeOptions = idTypeValues.map((v) => ({ value: v, label: tIdType(v) }));
  // TCK-921 — chaque langue nommée dans celle de l'interface ; « Par défaut » l'efface, comme
  // « Indifférent » efface un critère.
  const localeOptions = [
    { value: CUSTOMER_LOCALE_DEFAULT, label: t('localeDefault') },
    ...customerLocaleValues.map((v) => ({ value: v, label: localeDisplayLabel(v, locale) })),
  ];

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<CustomerFormValues, CustomerDetail>({
      schema: customerFormSchema,
      defaultValues:
        mode === 'create' && initial
          ? { ...toDefaults(), ...Object.fromEntries(Object.entries(initial).filter(([, v]) => Boolean(v))) }
          : toDefaults(customer),
      onSubmit: async (values) => {
        // TCK-1347 — en édition, un champ vidé part à `null` (les valeurs de la fiche en référence).
        const normalise = normaliseCustomerForm(
          values,
          mode === 'edit' && customer ? toDefaults(customer) : undefined,
        );
        // 8a — la feuille ne porte pas l'étape : une étape changée dans l'en-tête, feuille ouverte,
        // ne se fait pas écraser par celle que le formulaire a lue à l'ouverture.
        const { pipeline_stage: _etapeLue, ...sansEtape } = normalise;
        const champs = forme === 'feuille' ? sansEtape : normalise;
        const payload = {
          ...(showsCriteria ? champs : sansCriteres(champs)),
          ...(allowDuplicate.current ? { allow_duplicate: true } : {}),
        };
        allowDuplicate.current = false;
        setDuplicates(null);
        const result =
          mode === 'edit' && customer
            ? await updateCustomerAction(customer.id, payload)
            : await createCustomerAction({
                ...sansStatut(payload),
                ...(visiteDOrigine !== undefined ? { property_visit_id: visiteDOrigine } : {}),
              });
        if (!result.ok) {
          if (result.duplicates) setDuplicates(result.duplicates);
          throw new ApiError(result.status ?? 500, {
            message: result.message,
            errors: result.errors,
          });
        }
        return result.data as CustomerDetail;
      },
      onSuccess: async (result) => {
        if (onSuccess) {
          onSuccess(result);
          return;
        }
        router.push(`/app/customers/${result.id}`);
        router.refresh();
      },
    });

  // P08.06 (TCK-755) — avertir avant de quitter la page, seulement quand le formulaire est modifié.
  // `useFormState` et non `form.formState` lu au rendu : compilé, la lecture resterait figée (TCK-571).
  const { isDirty, errors } = useFormState({ control: form.control });
  useAvertissementDepart(isDirty);
  useEffect(() => {
    onEtat?.({ enCours: isSubmitting, modifie: isDirty });
  }, [onEtat, isSubmitting, isDirty]);
  // Une section repliée qui porte une erreur (422, validation) s'ouvre : l'erreur ne se cache pas.
  const sectionsEnErreur = (Object.keys(SECTIONS_DES_CHAMPS) as SectionDuFormulaire[]).filter((section) =>
    SECTIONS_DES_CHAMPS[section].some((champ) => errors[champ] !== undefined),
  );

  const { control } = form;
  // « Indifférent » est une option à part entière : sans elle, un type choisi ne s'effaçait plus.
  // `any` n'est pas une valeur de l'API — `normaliseCustomerForm` la rend en `null`.
  const contractOptions = [
    { value: 'any', label: tCrm('criteria.any') },
    ...seekingContractTypeValues.map((v) => ({ value: v, label: tContract(v) })),
  ];
  const confirmDuplicate = () => {
    allowDuplicate.current = true;
    void handleSubmit();
  };
  // `lg` et non `md` : sous la barre latérale, 768 laisse ~416 px à la carte du formulaire, soit
  // deux champs de 200 px (revue design 2026-09-16, règle TCK-505).

  // Lot D2 — les pièces communes aux deux formes (la page, la feuille « Modifier » de la fiche).
  // TCK-591 — la saisie du profil (TCK-566/574) : indicatif en préfixe, valeur en E.164.
  const champTelephone = (
    <Controller
      control={control}
      name="phone"
      render={({ field, fieldState }) => (
        <div className="w-full">
          <label htmlFor="field-phone" className="mb-1.5 block text-sm font-medium">{t('phone')}</label>
          <PhoneInput
            id="field-phone"
            value={field.value ?? ''}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
            aria-invalid={fieldState.error ? true : undefined}
            aria-describedby={fieldState.error ? 'field-phone-error' : undefined}
          />
          <FormError id="field-phone-error">{fieldState.error?.message}</FormError>
        </div>
      )}
    />
  );
  const champsPiece = (
    <div className="grid gap-4 lg:grid-cols-2">
      <FormSelect
        control={control}
        name="id_type"
        label={t('idType')}
        options={idTypeOptions}
        placeholder={t('idTypePlaceholder')}
      />
      <div>
        <FormInput
          control={control}
          name="id_number"
          label={t('idNumber')}
          placeholder={customer?.id_number_masked ? t('idNumberKept', { masque: customer.id_number_masked }) : undefined}
        />
        {canRevealIdNumber && customer?.id_number_masked ? (
          <RevelationNumeroDePiece customerId={customer.id} masque={customer.id_number_masked} />
        ) : null}
      </div>
    </div>
  );

  return (
    <form id={idDuFormulaire} onSubmit={handleSubmit} className={forme === 'feuille' ? 'space-y-4' : 'space-y-6'} noValidate>
      {duplicates ? (
        <div role="status" className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
          <p className="font-medium text-foreground">{tCrm('duplicate.title')}</p>
          <ul className="space-y-1">
            {duplicates.map((d, i) => (
              <li key={d.id ?? `hidden-${i}`} className="flex flex-wrap items-center gap-x-2">
                <span>
                  {d.name ?? tCrm('duplicate.hidden')}
                  {' · '}
                  {tCrm(`duplicate.matchedOn.${d.matched_on}`)}
                </span>
                {d.id !== null ? (
                  <Link href={`/app/customers/${d.id}`} className="underline underline-offset-2">
                    {tCrm('duplicate.open')}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" onClick={confirmDuplicate} disabled={isSubmitting}>
            {mode === 'create' ? tCrm('duplicate.createAnyway') : tCrm('duplicate.saveAnyway')}
          </Button>
        </div>
      ) : null}

      <FormGlobalError>
        {globalError && !duplicates ? (
          <span className="flex items-center justify-between gap-4">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={clearGlobalError}
              className="shrink-0 rounded-sm px-1 py-1 text-xs underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tCommon('close')}
            </button>
          </span>
        ) : null}
      </FormGlobalError>

      {forme === 'feuille' ? (
        <FeuilleDuFormulaire
          customer={customer}
          enErreur={sectionsEnErreur}
          identite={
            <>
              {/* Maquette a-2 : prénom et nom côte à côte à toute largeur, la langue seule sur sa ligne. */}
              <div className="grid grid-cols-2 gap-4">
                <FormInput control={control} name="first_name" label={t('firstName')} required />
                <FormInput control={control} name="last_name" label={t('lastName')} required />
              </div>
              <FormInput control={control} name="occupation" label={t('occupation')} placeholder={t('occupationPlaceholder')} />
              <FormSelect control={control} name="locale" label={t('locale')} options={localeOptions} placeholder={t('localeDefault')} />
              <FormSelect control={control} name="status" label={t('status')} options={customerStatusOptions} />
            </>
          }
          contact={
            <>
              {champTelephone}
              <FormInput control={control} name="email" label={t('email')} type="email" autoComplete="email" />
            </>
          }
          recherche={
            showsCriteria ? (
              <>
                <ChampsDeLaRecherche control={control} prefixe="modifier" />
                <div className="grid gap-4 lg:grid-cols-2">
                  <FormInput control={control} name="min_bedrooms" label={tCrm('criteria.minBedrooms')} inputMode="numeric" />
                  <FormInput control={control} name="budget_min" label={tCrm('criteria.budgetMin')} inputMode="decimal" />
                </div>
                <FormInput control={control} name="seeking_cities" label={tCrm('criteria.cities')} placeholder={tCrm('criteria.citiesPlaceholder')} />
              </>
            ) : null
          }
          piece={champsPiece}
        />
      ) : (
        <>
        <div className="rounded-xl bg-card p-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <FormInput control={control} name="first_name" label={t('firstName')} required />
            <FormInput control={control} name="last_name" label={t('lastName')} required />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <FormInput
              control={control}
              name="email"
              label={t('email')}
              type="email"
              autoComplete="email"
            />
            {champTelephone}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <FormInput
              control={control}
              name="occupation"
              label={t('occupation')}
              placeholder={t('occupationPlaceholder')}
            />
            {/* TCK-921 — la langue des SMS et messages du client tant qu'il n'a pas de compte. */}
            <FormSelect
              control={control}
              name="locale"
              label={t('locale')}
              options={localeOptions}
              placeholder={t('localeDefault')}
            />
          </div>
        </div>

        <div className="rounded-xl bg-card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold tracking-tight text-foreground">{t('crmSection')}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <FormSelect
              control={control}
              name="pipeline_stage"
              label={t('pipelineStage')}
              options={pipelineStageOptions}
            />
            {/* TCK-1064 (P80.01) — l'API crée toujours un client actif : le statut ne se choisit qu'en édition. */}
            {mode === 'edit' ? (
              <FormSelect
                control={control}
                name="status"
                label={t('status')}
                options={customerStatusOptions}
              />
            ) : null}
          </div>
        </div>

        {/* TCK-591 §5 — ce que le prospect cherche ; le rapprochement et le résumé du matin en partent. */}
        {showsCriteria ? (
          <fieldset className="rounded-xl bg-card p-6 space-y-4">
            <legend className="font-display text-base font-semibold tracking-tight text-foreground">
              {tCrm('criteria.title')}
            </legend>
            <div className="grid gap-4 lg:grid-cols-2">
              <FormSelect
                control={control}
                name="seeking_contract_type"
                label={tCrm('criteria.contractType')}
                options={contractOptions}
                placeholder={tCrm('criteria.any')}
              />
              <FormInput
                control={control}
                name="min_bedrooms"
                label={tCrm('criteria.minBedrooms')}
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <FormInput control={control} name="budget_min" label={tCrm('criteria.budgetMin')} inputMode="decimal" />
              <FormInput control={control} name="budget_max" label={tCrm('criteria.budgetMax')} inputMode="decimal" />
            </div>
            <Controller
              control={control}
              name="seeking_property_types"
              render={({ field }) => {
                const selected = field.value ?? [];
                return (
                  <div>
                    <p id="criteria-types" className="mb-1.5 text-sm font-medium">{tCrm('criteria.propertyTypes')}</p>
                    <div role="group" aria-labelledby="criteria-types" className="flex flex-wrap gap-2">
                      {seekingPropertyTypeValues.map((type) => {
                        const on = selected.includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            aria-pressed={on}
                            onClick={() => field.onChange(on ? selected.filter((v) => v !== type) : [...selected, type])}
                            className={
                              'min-h-11 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring '
                              + (on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted')
                            }
                          >
                            {tPropertyType(type)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <FormInput
                control={control}
                name="seeking_cities"
                label={tCrm('criteria.cities')}
                placeholder={tCrm('criteria.citiesPlaceholder')}
              />
              <FormInput
                control={control}
                name="seeking_neighborhoods"
                label={tCrm('criteria.neighborhoods')}
                placeholder={tCrm('criteria.neighborhoodsPlaceholder')}
              />
            </div>
            <p className="text-xs text-muted-foreground">{tCrm('criteria.help')}</p>
          </fieldset>
        ) : null}

        <div className="rounded-xl bg-card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold tracking-tight text-foreground">{t('idSection')}</h2>
          {champsPiece}
        </div>
        </>
      )}

      {/* La feuille n'a pas ses boutons : le pied du panneau les porte (`idDuFormulaire`). */}
      {forme === 'feuille' ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                <span>{t('saving')}</span>
              </>
            ) : (
              <span>{mode === 'create' ? t('create') : tCommon('save')}</span>
            )}
          </Button>
          {!onSuccess ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              {tCommon('cancel')}
            </Button>
          ) : null}
        </div>
      )}
    </form>
  );
}

/** Lot D2 — les sections de la feuille « Modifier », et les champs que chacune porte. */
type SectionDuFormulaire = 'identite' | 'contact' | 'recherche' | 'piece';
const SECTIONS_DES_CHAMPS: Record<SectionDuFormulaire, readonly (keyof CustomerFormValues)[]> = {
  identite: ['first_name', 'last_name', 'occupation', 'locale', 'status'],
  contact: ['phone', 'email'],
  recherche: ['seeking_contract_type', 'seeking_property_types', 'seeking_neighborhoods', 'seeking_cities', 'budget_min', 'budget_max', 'min_bedrooms'],
  piece: ['id_type', 'id_number'],
};

function SectionDeLaFeuille({
  titre,
  resume,
  ouverteAuDepart,
  forcee,
  children,
}: {
  readonly titre: string;
  readonly resume?: string | null;
  readonly ouverteAuDepart: boolean;
  /** Une erreur dans la section : ouverte, quoi qu'on ait touché. */
  readonly forcee: boolean;
  readonly children: ReactNode;
}) {
  const [ouverte, setOuverte] = useState(ouverteAuDepart);
  const visible = ouverte || forcee;
  return (
    <section data-slot="section-de-la-feuille" className="rounded-xl border border-border bg-card">
      <h3>
        <button
          type="button"
          aria-expanded={visible}
          onClick={() => setOuverte(!visible)}
          className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1 leading-snug">
            <span className="block text-corps font-semibold">{titre}</span>
            {!visible && resume ? <span className="block truncate text-ui text-muted-foreground">{resume}</span> : null}
          </span>
          <ChevronDown className={cn('size-4 flex-none text-muted-foreground transition-transform', visible && 'rotate-180')} aria-hidden="true" />
        </button>
      </h3>
      {/* Repliée, la section garde ses champs montés : rien ne se perd de la saisie, et l'envoi les porte. */}
      <div className={cn('space-y-4 border-t border-border p-4', !visible && 'hidden')}>{children}</div>
    </section>
  );
}

/** Identité ouverte, Contact repliée (son résumé), Ce qu'il cherche ouverte, Pièce repliée (décision 9a). */
function FeuilleDuFormulaire({
  customer,
  enErreur,
  identite,
  contact,
  recherche,
  piece,
}: {
  readonly customer?: CustomerDetail;
  readonly enErreur: readonly SectionDuFormulaire[];
  readonly identite: ReactNode;
  readonly contact: ReactNode;
  readonly recherche: ReactNode;
  readonly piece: ReactNode;
}) {
  const t = useTranslations('crm.fiche.modifier');
  const contactLu = [customer?.phone ? formaterTelephone(customer.phone) : null, customer?.email ?? null].filter(Boolean).join(' · ');
  return (
    <div className="space-y-3" data-slot="feuille-du-formulaire">
      <SectionDeLaFeuille titre={t('identite')} ouverteAuDepart forcee={enErreur.includes('identite')}>
        {identite}
      </SectionDeLaFeuille>
      <SectionDeLaFeuille titre={t('contact')} resume={contactLu || t('aucunContact')} ouverteAuDepart={false} forcee={enErreur.includes('contact')}>
        {contact}
      </SectionDeLaFeuille>
      {recherche ? (
        <SectionDeLaFeuille titre={t('recherche')} ouverteAuDepart forcee={enErreur.includes('recherche')}>
          {recherche}
        </SectionDeLaFeuille>
      ) : null}
      <SectionDeLaFeuille titre={t('piece')} resume={customer?.id_number_masked ?? t('aucunePiece')} ouverteAuDepart={false} forcee={enErreur.includes('piece')}>
        {piece}
      </SectionDeLaFeuille>
    </div>
  );
}
