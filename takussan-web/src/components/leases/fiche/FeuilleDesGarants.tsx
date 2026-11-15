'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { z } from 'zod';
import { Phone } from 'lucide-react';

import { ErreurDeLecture } from '@/components/feedback';
import { FormError, FormGlobalError, FormInput, FormSelect, FormTextarea } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PhoneInput } from '@/components/ui/phone-input';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateGuarantor, useGuarantor, useUpdateGuarantor, type CreateGuarantorPayload, type LeaseGuarantor } from '@/lib/queries/leases';
import { nomCompletDe } from '@/lib/identite';
import { guarantorSchema, type GuarantorFormValues } from '@/lib/schemas/lease';
import type { Guarantor } from '@/types/lease';

/**
 * TCK-2762 — la feuille des garants d'un bail : ce que faisait la carte « Garants »
 * (`GuarantorSection`, retirée de la fiche), plus la modification, ouverte depuis la ligne du garant de
 * « Parties » (bureau) ou « Garant (n) » du dossier (téléphone).
 *
 * - Les garants du pivot (`GET /api/leases/{id}/guarantors`, lus une fois par la fiche) : nom,
 *   téléphone en lien `tel:` (TCK-913), adresse ; sur une ligne modifiable, l'état de la pièce
 *   (« renseignée » : l'API sait qu'un numéro est saisi, pas qu'un document est reçu).
 * - L'ajout, à qui a `abilities.update`, tant que le bail en porte moins de trois (TCK-044 : le serveur
 *   tient la borne, le bouton la reflète).
 * - La modification, sur la ligne dont l'API dit `can_edit` (la policy du garant). Le garant est
 *   PARTAGÉ : la feuille le dit quand il porte d'autres baux. Le corps ne porte que les champs changés,
 *   et la pièce et le revenu laissés vides gardent leur valeur chiffrée.
 *
 * Les formulaires s'ouvrent DANS la feuille : pas de dialogue par-dessus une feuille.
 */

/** Valeurs d'enum ; les libellés vivent sous `lease.guarantor.idTypes.*`. */
const ID_TYPES = ['id_card', 'passport', 'driving_license'] as const;

export const MAX_GARANTS = 3;

export const nomDuGarant = (g: Pick<LeaseGuarantor, 'first_name' | 'last_name'>) => nomCompletDe(g) ?? '';

/** « pièce d'identité renseignée / manquante », sur une ligne modifiable seulement (l'API ne la sert qu'à elle). */
export function useEtatDeLaPiece() {
  const t = useTranslations('lease.guarantor');
  return (g: LeaseGuarantor): string | null => (g.id_on_file === undefined ? null : g.id_on_file ? t('pieceRenseignee') : t('pieceManquante'));
}

/** Le formulaire de modification : le revenu vidé n'est pas un 0, c'est « garder la valeur ». */
const schemaDeModification = guarantorSchema.extend({
  monthly_income: z.union([z.number().nonnegative(), z.literal('').transform(() => undefined)]).optional(),
});
type ValeursDeModification = z.input<typeof schemaDeModification>;

type Vue = { readonly type: 'liste' } | { readonly type: 'ajout' } | { readonly type: 'modifier'; readonly garant: LeaseGuarantor };

interface FeuilleDesGarantsProps {
  readonly leaseId: number;
  readonly garants: readonly LeaseGuarantor[];
  /** `abilities.update` du bail : l'ajout. Sans lui, la feuille se lit seulement. */
  readonly peutGerer: boolean;
  readonly ouverte: boolean;
  /** Ouverte directement sur le formulaire d'ajout (la ligne « Ajouter un garant » d'un bail sans garant). */
  readonly surLAjout?: boolean;
  readonly onFermer: () => void;
}

export function FeuilleDesGarants({ leaseId, garants, peutGerer, ouverte, surLAjout = false, onFermer }: FeuilleDesGarantsProps) {
  const t = useTranslations('lease.guarantor');
  const tCommon = useTranslations('common');
  const etatDeLaPiece = useEtatDeLaPiece();
  const creation = useCreateGuarantor(leaseId);
  const [vue, setVue] = useState<Vue>(surLAjout ? { type: 'ajout' } : { type: 'liste' });
  const auPlafond = garants.length >= MAX_GARANTS;
  const idFormulaire = `garant-du-bail-${leaseId}`;

  const fermer = () => {
    setVue(surLAjout ? { type: 'ajout' } : { type: 'liste' });
    onFermer();
  };
  const revenir = () => (garants.length > 0 ? setVue({ type: 'liste' }) : fermer());
  const [enregistrement, setEnregistrement] = useState(false);

  const titre = vue.type === 'ajout' ? t('add') : vue.type === 'modifier' ? t('modifierLeGarant') : t('title');
  const pied =
    vue.type === 'liste' ? (
      peutGerer ? (
        <Button type="button" size="xl" variant="outline" className="w-full md:w-auto" disabled={auPlafond} onClick={() => setVue({ type: 'ajout' })}>
          {t('add')}
        </Button>
      ) : undefined
    ) : (
      <>
        <Button type="button" variant="outline" className="max-md:hidden" onClick={revenir}>
          {tCommon('actions.cancel')}
        </Button>
        <Button
          type="submit"
          form={idFormulaire}
          size="xl"
          className="w-full font-semibold md:w-auto"
          disabled={vue.type === 'ajout' ? creation.isPending : enregistrement}
        >
          {vue.type === 'ajout' ? (creation.isPending ? t('adding') : t('submit')) : enregistrement ? t('enregistrement') : t('enregistrer')}
        </Button>
      </>
    );

  return (
    <FeuilleDuBas open={ouverte} onOpenChange={(o) => (o ? undefined : fermer())} titre={titre} pied={pied}>
      {vue.type === 'ajout' ? (
        <FormulaireDAjout creation={creation} id={idFormulaire} onEnregistre={() => setVue({ type: 'liste' })} />
      ) : vue.type === 'modifier' ? (
        <Modification
          key={vue.garant.id}
          leaseId={leaseId}
          garant={vue.garant}
          id={idFormulaire}
          onEnCours={setEnregistrement}
          onEnregistre={() => setVue({ type: 'liste' })}
        />
      ) : (
        <div className="space-y-3" data-testid="feuille-des-garants">
          {garants.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}
          {garants.length > 0 ? (
            <ul className="-mx-4 divide-y divide-border border-y border-border">
              {garants.map((g) => {
                const piece = etatDeLaPiece(g);
                return (
                  <li key={g.id} className="flex items-start gap-3 px-4 py-3" data-testid={`garant-${g.id}`}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-corps font-medium">{nomDuGarant(g)}</p>
                      {piece ? <p className="text-ui text-muted-foreground">{piece}</p> : null}
                      {g.phone ? (
                        // TCK-913 — un appui appelle le garant, depuis la fiche du bail.
                        <a
                          href={`tel:${g.phone.replace(/\s+/g, '')}`}
                          className="-my-1 inline-flex items-center gap-1.5 py-1 text-sm text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                        >
                          <Phone className="size-4" strokeWidth={1.75} aria-hidden="true" />
                          {g.phone}
                        </a>
                      ) : null}
                      {g.email ? <p className="truncate text-ui text-muted-foreground">{g.email}</p> : null}
                    </div>
                    {g.can_edit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('modifierNomme', { nom: nomDuGarant(g) })}
                        onClick={() => setVue({ type: 'modifier', garant: g })}
                      >
                        {t('modifier')}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {peutGerer ? (
            <p className="text-ui text-muted-foreground">{auPlafond ? t('maxReached', { max: String(MAX_GARANTS) }) : t('max', { max: String(MAX_GARANTS) })}</p>
          ) : null}
        </div>
      )}
    </FeuilleDuBas>
  );
}

function FormulaireDAjout({
  creation,
  id,
  onEnregistre,
}: {
  readonly creation: ReturnType<typeof useCreateGuarantor>;
  readonly id: string;
  readonly onEnregistre: () => void;
}) {
  const { form, handleSubmit, globalError } = useApiForm<GuarantorFormValues, unknown>({
    schema: guarantorSchema,
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      id_type: undefined,
      id_number: '',
      occupation: '',
      employer: '',
      monthly_income: 0,
      relationship_to_tenant: '',
    },
    onSubmit: async (values) => {
      await creation.mutateAsync(values);
      return undefined;
    },
    onSuccess: () => {
      form.reset();
      onEnregistre();
    },
  });

  return (
    <form
      id={id}
      noValidate
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-4"
      data-testid="formulaire-du-garant"
    >
      <FormGlobalError>{globalError}</FormGlobalError>
      <ChampsDuGarant control={form.control as unknown as Control<FieldValues>} />
    </form>
  );
}

/** La modification : la fiche du garant se lit d'abord (préremplissage), puis le formulaire. */
function Modification({
  leaseId,
  garant,
  id,
  onEnCours,
  onEnregistre,
}: {
  readonly leaseId: number;
  readonly garant: LeaseGuarantor;
  readonly id: string;
  readonly onEnCours: (enCours: boolean) => void;
  readonly onEnregistre: () => void;
}) {
  const t = useTranslations('lease.guarantor');
  const tRacine = useTranslations();
  const lecture = useGuarantor(garant.id);
  const fiche = lecture.data?.data;

  if (lecture.isError) {
    return (
      <ErreurDeLecture erreur={lecture.error} message={t('lectureEchouee')} onRetry={() => void lecture.refetch()} retryLabel={tRacine('common.actions.retry')} />
    );
  }
  if (!fiche) return <p className="text-sm text-muted-foreground">{t('lecture')}</p>;
  return <FormulaireDeModification leaseId={leaseId} garant={garant} fiche={fiche} id={id} onEnCours={onEnCours} onEnregistre={onEnregistre} />;
}

function FormulaireDeModification({
  leaseId,
  garant,
  fiche,
  id,
  onEnCours,
  onEnregistre,
}: {
  readonly leaseId: number;
  readonly garant: LeaseGuarantor;
  readonly fiche: Guarantor;
  readonly id: string;
  readonly onEnCours: (enCours: boolean) => void;
  readonly onEnregistre: () => void;
}) {
  const t = useTranslations('lease.guarantor');
  const modification = useUpdateGuarantor(garant.id, leaseId);
  const autresBaux = Math.max(0, (garant.leases_count ?? 1) - 1);

  const { form, handleSubmit, globalError } = useApiForm<ValeursDeModification, unknown>({
    schema: schemaDeModification,
    defaultValues: {
      first_name: fiche.first_name,
      last_name: fiche.last_name,
      phone: fiche.phone ?? '',
      email: fiche.email ?? '',
      id_type: fiche.id_type ?? undefined,
      // La pièce et le revenu ne reviennent que masqués : le champ part vide, et vide il garde la valeur.
      id_number: '',
      occupation: fiche.occupation ?? '',
      employer: fiche.employer ?? '',
      monthly_income: '',
      relationship_to_tenant: fiche.relationship_to_tenant ?? '',
      notes: fiche.notes ?? '',
    },
    onSubmit: async (values) => {
      // Seuls les champs CHANGÉS partent : un champ chiffré laissé vide (`undefined` après le schéma)
      // ne s'écrase pas, et un champ intouché ne réécrit rien.
      const changes = form.formState.dirtyFields as Partial<Record<keyof CreateGuarantorPayload, boolean>>;
      const corps = Object.fromEntries(
        Object.entries(values).filter(([cle, valeur]) => changes[cle as keyof CreateGuarantorPayload] && valeur !== undefined),
      ) as Partial<CreateGuarantorPayload>;
      onEnCours(true);
      try {
        await modification.mutateAsync(corps);
      } finally {
        onEnCours(false);
      }
      return undefined;
    },
    onSuccess: () => onEnregistre(),
  });
  // Lu au rendu : `formState` est un Proxy, et `dirtyFields` n'est tenu à jour que pour qui s'y abonne.
  void form.formState.dirtyFields;

  return (
    <form
      id={id}
      noValidate
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-4"
      data-testid="modification-du-garant"
    >
      {autresBaux > 0 ? (
        <p role="note" className="rounded-lg bg-muted/60 p-3 text-ui text-foreground" data-testid="garant-partage">
          {t('partage', { n: autresBaux })}
        </p>
      ) : null}
      <FormGlobalError>{globalError}</FormGlobalError>
      <ChampsDuGarant
        control={form.control as unknown as Control<FieldValues>}
        aideDeLaPiece={fiche.id_number_masked ? t('pieceGardee', { masque: fiche.id_number_masked }) : null}
        aideDuRevenu={fiche.monthly_income_masked ? t('revenuGarde') : null}
      />
    </form>
  );
}

/** Les champs d'un garant, communs à l'ajout et à la modification. */
function ChampsDuGarant({
  control,
  aideDeLaPiece = null,
  aideDuRevenu = null,
}: {
  readonly control: Control<FieldValues>;
  readonly aideDeLaPiece?: string | null;
  readonly aideDuRevenu?: string | null;
}) {
  const t = useTranslations('lease.guarantor');
  const idTypeOptions = ID_TYPES.map((value) => ({ value, label: t(`idTypes.${value}`) }));
  const champ = (nom: keyof GuarantorFormValues) => nom as Path<FieldValues>;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput control={control} name={champ('first_name')} label={t('firstName')} required />
        <FormInput control={control} name={champ('last_name')} label={t('lastName')} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* TCK-913 — `PhoneInput` : clavier téléphonique, indicatif en préfixe, valeur E.164. */}
        <Controller
          control={control}
          name={champ('phone')}
          render={({ field, fieldState }) => (
            <div className="w-full">
              <label htmlFor="field-phone" className="mb-1.5 block text-sm font-medium">
                {t('phone')}
              </label>
              <PhoneInput
                id="field-phone"
                name={field.name}
                value={(field.value as string | undefined) ?? ''}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={fieldState.error ? 'field-phone-error' : undefined}
              />
              <FormError id="field-phone-error">{fieldState.error?.message}</FormError>
            </div>
          )}
        />
        <FormInput control={control} name={champ('email')} type="email" label={t('email')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect control={control} name={champ('id_type')} label={t('idType')} placeholder={t('idTypePlaceholder')} options={idTypeOptions} />
        <div>
          <FormInput control={control} name={champ('id_number')} label={t('idNumber')} />
          {aideDeLaPiece ? <p className="mt-1 text-ui text-muted-foreground">{aideDeLaPiece}</p> : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput control={control} name={champ('occupation')} label={t('occupation')} />
        <FormInput control={control} name={champ('employer')} label={t('employer')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FormInput control={control} name={champ('monthly_income')} type="number" label={t('monthlyIncome')} min={0} />
          {aideDuRevenu ? <p className="mt-1 text-ui text-muted-foreground">{aideDuRevenu}</p> : null}
        </div>
        <FormInput control={control} name={champ('relationship_to_tenant')} label={t('relationshipToTenant')} placeholder={t('relationshipPlaceholder')} />
      </div>
      <FormTextarea control={control} name={champ('notes')} label={t('notes')} rows={2} />
    </>
  );
}
