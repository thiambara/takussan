'use client';

// TCK-2878 — le nom d'un garant, par la règle du nom affichable.
import { nomAffichable } from '@/lib/identite';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserPlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input, type ProfilDeChamp } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useAjouterUnGarant, useRetirerUnGarant, type GarantSaisi } from '@/lib/queries/candidature-et-bail';
import { codeDuRefus } from '@/lib/reservations/saisie-de-demande';
import type { Booking } from '@/types/booking';

import { FeuilleOuPanneau } from '../feuilles/pieces-des-feuilles';

/**
 * TCK-2878 (ADR-0110 § 3, TCK-2893) — les garants d'une candidature, au personnel : les nommer, en
 * ajouter un (le garant que la candidature reprend au bail), en retirer un. Hors maquette (la maquette
 * e6 montre « Garant · Oui · Ibrahima Dieng, son frère » sans geste) : c'est le seul chemin du front
 * vers `POST|DELETE /api/bookings/{id}/guarantors`, et donc vers ses refus.
 *
 * Les refus de l'API ont leur texte ICI (le front possède le texte) : la table `CLE_DU_CODE`.
 */
export const CLE_DU_CODE: Readonly<Record<string, string>> = {
  'booking.guarantor_not_for_kind': 'pasPourCetteNature',
  'booking.guarantor_already_attached': 'dejaRattache',
  'booking.guarantor_not_attached': 'pasRattache',
  'booking.max_guarantors': 'troisAuPlus',
  'booking.dossier_closed': 'dossierClos',
};

/** Le message d'un refus : le code connu d'abord, puis la première erreur de champ, puis la prose de l'API. */
function useMessageDuRefus(): (erreur: unknown) => string {
  const t = useTranslations('bookings.fiche.garants');
  const messageErreur = useMessageErreurApi();
  return (erreur) => {
    const code = codeDuRefus(erreur);
    if (code && CLE_DU_CODE[code]) return t(`codes.${CLE_DU_CODE[code]}`);
    const champ = erreur instanceof ApiError ? Object.values(erreur.validationErrors ?? {})[0]?.[0] : undefined;
    return champ ?? messageErreur(erreur, t('echec'));
  };
}

const VIDE: GarantSaisi = { first_name: '', last_name: '', phone: '', relationship_to_tenant: '' };

/** ADR-0135 — le clavier de chaque champ du garant. La saisie automatique reste coupée : c'est un tiers, pas l'utilisateur. */
const PROFIL_DU_GARANT = {
  first_name: 'nom',
  last_name: 'nom',
  phone: 'telephone',
  relationship_to_tenant: 'mots',
} as const satisfies Record<keyof GarantSaisi, ProfilDeChamp>;

export function GarantsDeLaCandidature({ booking }: { readonly booking: Booking }) {
  const t = useTranslations('bookings.fiche.garants');
  const messageDuRefus = useMessageDuRefus();
  const retirer = useRetirerUnGarant(booking.id);
  const [ouverte, setOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const garants = booking.guarantors ?? [];
  const surRetirer = async (guarantorId: number) => {
    setErreur(null);
    try {
      await retirer.mutateAsync({ guarantorId });
    } catch (e) {
      setErreur(messageDuRefus(e));
    }
  };
  return (
    <div data-slot="garants-de-la-candidature" className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-surtitre text-muted-foreground">{t('titre')}</p>
      {garants.length > 0 ? (
        <ul className="mt-2 divide-y divide-border">
          {garants.map((g) => {
            const nom = nomAffichable(g);
            return (
              <li key={g.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {nom}
                  {g.relationship_to_tenant ? <span className="text-muted-foreground"> · {g.relationship_to_tenant}</span> : null}
                </span>
                <Button type="button" variant="ghost" size="sm" aria-label={t('retirer', { nom })} onClick={() => void surRetirer(g.id)} disabled={retirer.isPending}>
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t('aucun')}</p>
      )}
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setOuverte(true)}>
        <UserPlus className="size-4" aria-hidden="true" />
        {t('ajouter')}
      </Button>
      {erreur ? (
        <p role="alert" className="mt-1.5 text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
      {ouverte ? <FeuilleDuGarant bookingId={booking.id} onOpenChange={setOuverte} /> : null}
    </div>
  );
}

/** « Ajouter un garant » : prénom et nom requis, téléphone et lien facultatifs. Montée ouverte seulement. */
function FeuilleDuGarant({ bookingId, onOpenChange }: { readonly bookingId: number; readonly onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('bookings.fiche.garants');
  const formId = useId();
  const messageDuRefus = useMessageDuRefus();
  const ajouter = useAjouterUnGarant(bookingId);
  const [valeurs, setValeurs] = useState<GarantSaisi>(VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = (nom: keyof GarantSaisi, libelle: string, requis = false) => (
    <div>
      <Label htmlFor={`${formId}-${nom}`}>{libelle}</Label>
      <Input
        profil={PROFIL_DU_GARANT[nom]}
        autoComplete="off"
        id={`${formId}-${nom}`}
        placeholder={t(`exemples.${nom}`)}
        className="mt-1.5"
        required={requis}
        value={valeurs[nom] ?? ''}
        onChange={(e) => setValeurs((v) => ({ ...v, [nom]: e.target.value }))}
      />
    </div>
  );
  const surEnvoyer = async () => {
    setErreur(null);
    const corps: GarantSaisi = {
      first_name: valeurs.first_name.trim(),
      last_name: valeurs.last_name.trim(),
      ...(valeurs.phone?.trim() ? { phone: valeurs.phone.trim() } : {}),
      ...(valeurs.relationship_to_tenant?.trim() ? { relationship_to_tenant: valeurs.relationship_to_tenant.trim() } : {}),
    };
    try {
      await ajouter.mutateAsync(corps);
      onOpenChange(false);
    } catch (e) {
      setErreur(messageDuRefus(e));
    }
  };
  return (
    <FeuilleOuPanneau
      open
      onOpenChange={onOpenChange}
      titre={t('ajouter')}
      pied={
        <Button type="submit" form={formId} className="w-full" disabled={ajouter.isPending}>
          {t('enregistrer')}
        </Button>
      }
    >
      <form
        id={formId}
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          void surEnvoyer();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          {champ('first_name', t('prenom'), true)}
          {champ('last_name', t('nom'), true)}
        </div>
        {champ('phone', t('telephone'))}
        {champ('relationship_to_tenant', t('lien'))}
        {erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
      </form>
    </FeuilleOuPanneau>
  );
}
