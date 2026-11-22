'use client';

import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { Input, type ProfilDeChamp } from '@/components/ui/input';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useApiForm } from '@/hooks/useApiForm';
import { useCan } from '@/hooks/useCan';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { inviteAgencyAgent } from '@/lib/queries/agency-invitations';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';

import { lienWhatsAppDeLInvitation, ouvrirOngletWhatsApp, type OngletWhatsApp } from './partage-whatsapp';

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
 * TCK-2928 — « Par WhatsApp » (téléphone) / « Lien par WhatsApp » (bureau) : le même formulaire, envoyé
 * avec `delivery: "share"` (ADR-0123) — aucun message ne part, la réponse rend `share_url` une fois et
 * l'onglet ouvert dans le geste part vers `wa.me/<numéro>?text=<message + lien>`. Le bouton vit hors du
 * formulaire (barre du bas au téléphone) : il appelle {@link PoigneeDInvitation.parWhatsApp}. Par
 * WhatsApp, le numéro est requis et l'e-mail doit rester vide (l'API le refuse : il serait posé vérifié
 * sans qu'aucun message y soit arrivé).
 *
 * La phrase de pied ne dit pas « choisit son mot de passe » (le parcours d'entrée retenu, famille 2,
 * décision 3, passe par un code SMS) : elle dit ce qui est vrai des deux parcours. Les 7 jours sont
 * `InvitationService::DEFAULT_TTL_DAYS`.
 */
const ROLES = ['agent', 'agency_admin'] as const;

type Voie = 'email' | 'whatsapp';

interface MessagesDuSchema {
  readonly emailInvalide: string;
  readonly requis: string;
  readonly telephoneRequis: string;
  readonly emailInterdit: string;
}

/** TCK-2928 — la voie (`email` ou `whatsapp`) est lue à la validation : le même schéma juge les deux. */
const schemaDe = (m: MessagesDuSchema, voie: () => Voie) =>
  z
    .object({
      first_name: z.string().trim().min(1, m.requis).max(80),
      last_name: z.string().trim().min(1, m.requis).max(80),
      email: z.string(),
      phone: z.string().trim().max(30).optional(),
      role: z.enum(ROLES),
    })
    .superRefine((v, ctx) => {
      if (voie() === 'whatsapp') {
        if (!v.phone?.trim()) ctx.addIssue({ code: 'custom', path: ['phone'], message: m.telephoneRequis });
        if (v.email.trim() !== '') ctx.addIssue({ code: 'custom', path: ['email'], message: m.emailInterdit });
        return;
      }
      if (!z.string().email().safeParse(v.email).success) ctx.addIssue({ code: 'custom', path: ['email'], message: m.emailInvalide });
    });

type Valeurs = z.infer<ReturnType<typeof schemaDe>>;

/** TCK-2928 — la voie de l'envoi en cours, posée par le geste et lue par la validation et l'envoi. */
function porteurDeVoie() {
  let voie: Voie = 'email';
  return { lire: (): Voie => voie, poser: (v: Voie) => void (voie = v) };
}

/** TCK-2928 — le geste « Par WhatsApp », appelé depuis un bouton posé hors du formulaire. */
export interface PoigneeDInvitation {
  readonly parWhatsApp: () => void;
}

interface FormulaireDInvitationProps {
  readonly id: string;
  readonly agencyId: number;
  readonly onEnvoyee?: () => void;
  /** Le bouton d'envoi, rendu là où l'écran le pose (dans la carte, ou dans la barre du bas). */
  readonly envoi?: (enCours: boolean) => ReactNode;
  readonly ref?: Ref<PoigneeDInvitation>;
}

export function FormulaireDInvitation({ id, agencyId, onEnvoyee, envoi, ref }: FormulaireDInvitationProps) {
  const t = useTranslations('admin.inviteAgent');
  const tF = useTranslations('admin.team.equipe.invitations.formulaire');
  const tI = useTranslations('admin.team.equipe.invitations');
  const { token } = useAuth();
  const toast = useToast();
  const garde = useGardeDoubleFacteur();
  const { can: peutNommerAdmin } = useCan('team.assign_role', agencyId);
  const roles = ROLES.filter((r) => r !== 'agency_admin' || peutNommerAdmin);
  // TCK-2928 — la voie de l'envoi en cours, et l'onglet ouvert dans le geste « Par WhatsApp ».
  // Un porteur stable (et non une ref) : le schéma le lit à la validation, jamais au rendu.
  const [voie] = useState(porteurDeVoie);
  const onglet = useRef<OngletWhatsApp | null>(null);
  const schema = schemaDe(
    {
      emailInvalide: t('emailInvalid'),
      requis: t('required'),
      telephoneRequis: tF('whatsappSansNumero'),
      emailInterdit: tF('whatsappSansEmail'),
    },
    voie.lire,
  );

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<Valeurs, Awaited<ReturnType<typeof inviteAgencyAgent>>>({
    schema,
    defaultValues: { first_name: '', last_name: '', email: '', phone: '', role: 'agent' },
    onSubmit: async (v) => {
      const parWhatsApp = voie.lire() === 'whatsapp';
      try {
        return await avecGardeDoubleFacteur(
          () =>
            inviteAgencyAgent(
              agencyId,
              {
                role: v.role,
                first_name: v.first_name,
                last_name: v.last_name,
                // Une chaîne vide n'est pas « pas de téléphone » : la règle de l'API est `nullable`.
                phone: v.phone?.trim() ? v.phone.trim() : null,
                ...(parWhatsApp ? { delivery: 'share' as const } : { email: v.email }),
              },
              token ?? '',
            ),
          garde,
        );
      } catch (e) {
        onglet.current?.fermer();
        onglet.current = null;
        throw e;
      }
    },
    onSuccess: (res, v) => {
      const ouvert = onglet.current;
      onglet.current = null;
      if (ouvert) {
        const lien = res.data?.share_url;
        const numero = res.data?.phone ?? v.phone ?? '';
        if (lien && numero) ouvert.partir(lienWhatsAppDeLInvitation(numero, tI('messageWhatsApp', { lien })));
        else ouvert.fermer();
        toast.add({ title: tF('partagee', { telephone: formaterTelephone(numero) }), type: 'success' });
      } else {
        toast.add({ title: tF('envoyee', { email: v.email }), type: 'success' });
      }
      form.reset();
      onEnvoyee?.();
    },
  });

  useImperativeHandle(ref, () => ({
    parWhatsApp: () => {
      voie.poser('whatsapp');
      // L'onglet s'ouvre dans le geste, et seulement si la saisie passera : sinon les erreurs
      // s'affichent sur leurs champs, sans onglet vide.
      if (schema.safeParse(form.getValues()).success) onglet.current = ouvrirOngletWhatsApp();
      void handleSubmit().finally(() => {
        voie.poser('email');
        // La validation a pu refuser après coup : un onglet qui n'a servi à rien se referme.
        onglet.current?.fermer();
        onglet.current = null;
      });
    },
  }));
  const {
    register,
    control,
    formState: { errors },
  } = form;

  const champ = (
    nom: 'first_name' | 'last_name' | 'email' | 'phone',
    libelle: string,
    profil: ProfilDeChamp,
    autoComplete: string,
    placeholder: string,
  ) => {
    const erreur = errors[nom]?.message;
    const champId = `${id}-${nom}`;
    return (
      <div>
        <label htmlFor={champId} className="mb-1.5 block text-sm font-medium">
          {libelle}
        </label>
        <Input
          id={champId}
          profil={profil}
          autoComplete={autoComplete}
          placeholder={placeholder}
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
    <form
      id={id}
      onSubmit={(e) => {
        voie.poser('email');
        void handleSubmit(e);
      }}
      noValidate
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        {champ('first_name', t('firstName'), 'nom', 'given-name', tF('exemplePrenom'))}
        {champ('last_name', t('lastName'), 'nom', 'family-name', tF('exempleNom'))}
      </div>
      {champ('email', tF('email'), 'courriel', 'email', t('emailPlaceholder'))}
      {champ('phone', t('phone'), 'telephone', 'tel', tF('exempleTelephone'))}
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
