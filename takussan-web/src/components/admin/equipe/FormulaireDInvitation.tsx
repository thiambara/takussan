'use client';

import type { ReactNode } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { Input } from '@/components/ui/input';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useApiForm } from '@/hooks/useApiForm';
import { useCan } from '@/hooks/useCan';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { inviteAgencyAgent } from '@/lib/queries/agency-invitations';
import { cn } from '@/lib/utils';

/**
 * TCK-2668 — « Inviter un membre » (maquette `app-equipe`, a, « Inviter et invitations » :
 * `FormulaireInvitation`), posé sur l'écran des invitations : au téléphone en tête de l'écran, son
 * envoi dans la barre du bas (`form=`), au bureau dans la colonne de droite. Remplace le dialogue
 * `InviteAgentDialog` (TCK-392) et en garde tout :
 *
 *  · `POST /api/agencies/{id}/agents/invite`, le SEUL chemin d'entrée dans l'équipe (TCK-2365) ;
 *  · prénom et nom, que la maquette ne dessine pas et que l'API exige (`InviteAgentRequest`), et le
 *    téléphone facultatif ;
 *  · deux rôles, « Administrateur » seulement pour qui porte `team.assign_role` (TCK-1498, TCK-2205) ;
 *  · la double authentification de l'admin (TCK-761), et les erreurs de saisie rendues sur leur champ
 *    par `useApiForm` (TCK-448).
 *
 * La phrase de pied ne dit pas « choisit son mot de passe » (le parcours d'entrée retenu, famille 2,
 * décision 3, passe par un code SMS) : elle dit ce qui est vrai des deux parcours. Les 7 jours sont
 * `InvitationService::DEFAULT_TTL_DAYS`.
 */
const ROLES = ['agent', 'agency_admin'] as const;

const schemaDe = (emailInvalide: string, requis: string) =>
  z.object({
    first_name: z.string().trim().min(1, requis).max(80),
    last_name: z.string().trim().min(1, requis).max(80),
    email: z.string().email(emailInvalide),
    phone: z.string().trim().max(30).optional(),
    role: z.enum(ROLES),
  });

type Valeurs = z.infer<ReturnType<typeof schemaDe>>;

interface FormulaireDInvitationProps {
  readonly id: string;
  readonly agencyId: number;
  readonly onEnvoyee?: () => void;
  /** Le bouton d'envoi, rendu là où l'écran le pose (dans la carte, ou dans la barre du bas). */
  readonly envoi?: (enCours: boolean) => ReactNode;
}

export function FormulaireDInvitation({ id, agencyId, onEnvoyee, envoi }: FormulaireDInvitationProps) {
  const t = useTranslations('admin.inviteAgent');
  const tF = useTranslations('admin.team.equipe.invitations.formulaire');
  const { token } = useAuth();
  const toast = useToast();
  const garde = useGardeDoubleFacteur();
  const { can: peutNommerAdmin } = useCan('team.assign_role', agencyId);
  const roles = ROLES.filter((r) => r !== 'agency_admin' || peutNommerAdmin);

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<Valeurs, unknown>({
    schema: schemaDe(t('emailInvalid'), t('required')),
    defaultValues: { first_name: '', last_name: '', email: '', phone: '', role: 'agent' },
    onSubmit: async (v) =>
      avecGardeDoubleFacteur(
        () =>
          inviteAgencyAgent(
            agencyId,
            {
              email: v.email,
              role: v.role,
              first_name: v.first_name,
              last_name: v.last_name,
              // Une chaîne vide n'est pas « pas de téléphone » : la règle de l'API est `nullable`.
              phone: v.phone?.trim() ? v.phone.trim() : null,
            },
            token ?? '',
          ),
        garde,
      ),
    onSuccess: () => {
      toast.add({ title: tF('envoyee', { email: form.getValues('email') }), type: 'success' });
      form.reset();
      onEnvoyee?.();
    },
  });
  const {
    register,
    control,
    formState: { errors },
  } = form;

  const champ = (nom: 'first_name' | 'last_name' | 'email' | 'phone', libelle: string, type: string, autoComplete: string) => {
    const erreur = errors[nom]?.message;
    const champId = `${id}-${nom}`;
    return (
      <div>
        <label htmlFor={champId} className="mb-1.5 block text-sm font-medium">
          {libelle}
        </label>
        <Input
          id={champId}
          type={type}
          autoComplete={autoComplete}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? `${champId}-erreur` : undefined}
          {...register(nom)}
        />
        {erreur ? (
          <p id={`${champId}-erreur`} role="alert" className="mt-1 text-xs text-destructive">
            {erreur}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form id={id} onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {champ('first_name', t('firstName'), 'text', 'given-name')}
        {champ('last_name', t('lastName'), 'text', 'family-name')}
      </div>
      {champ('email', tF('email'), 'email', 'email')}
      {champ('phone', t('phone'), 'tel', 'tel')}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t('role')}</legend>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={(v) => field.onChange(v)}
              aria-label={t('role')}
              className={cn('grid gap-2', roles.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}
            >
              {roles.map((r) => (
                <label
                  key={r}
                  className={cn(
                    'cursor-pointer rounded-lg border p-3',
                    field.value === r ? 'border-primary bg-secondary/60' : 'border-border hover:bg-muted/50',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Radio value={r} />
                    {t(`roles.${r}`)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{tF(`roleDetail.${r}`)}</span>
                </label>
              ))}
            </RadioGroup>
          )}
        />
      </fieldset>
      <p className="text-ui text-muted-foreground">{tF('validite')}</p>
      {globalError ? (
        <p role="alert" className="text-sm text-destructive">
          {globalError}
        </p>
      ) : null}
      {envoi ? envoi(isSubmitting) : null}
    </form>
  );
}
