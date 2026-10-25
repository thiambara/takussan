'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSetAgentCommissionRate } from '@/lib/queries/agency-roles';
import type { AgencyRoleAssignment } from '@/types/agency-role';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface AgentCommissionRateFieldProps {
  /** Le profil d'agent de ce membre DANS cette agence, avec son taux. */
  readonly assignment: AgencyRoleAssignment;
}

function enTexte(taux: number | null | undefined): string {
  return taux === null || taux === undefined ? '' : String(taux);
}

/**
 * TCK-2364 (P241.02 ; ADR-0049 « Ventilation » § 2) — le taux de commission d'un agent, sur sa fiche
 * de membre : sa part de la commission de chaque bail qu'il négocie, que le grand livre lui verse à
 * l'activation. Rien d'autre ne l'écrivait, et la règle ne servait personne.
 *
 * Même forme que {@see MemberAgencyRoleSelect}, son voisin de la fiche, et même garde
 * (`team.assign_role`) : le bouton n'apparaît qu'une fois le taux changé, un refus s'affiche tel que
 * le serveur l'écrit, et le champ revient au taux en place. Un champ vide efface le taux.
 */
export function AgentCommissionRateField({ assignment }: AgentCommissionRateFieldProps) {
  const t = useTranslations('admin.roles.commissionRate');
  const messageErreur = useMessageErreurApi();
  const setRate = useSetAgentCommissionRate(assignment.profile_id);

  const enPlace = enTexte(assignment.commission_rate);
  const [valeur, setValeur] = useState(enPlace);

  // Un tiers a pu changer le taux entre-temps : la liste refetchée le rapporte.
  const [synchronise, setSynchronise] = useState(enPlace);
  if (synchronise !== enPlace) {
    setSynchronise(enPlace);
    setValeur(enPlace);
  }

  const dirty = valeur.trim() !== enPlace;

  const submit = () => {
    const saisi = valeur.trim();
    setRate.mutate(
      { commission_rate: saisi === '' ? null : Number(saisi) },
      { onError: () => setValeur(enPlace) },
    );
  };

  const inputId = `agent-commission-rate-${assignment.profile_id}`;

  return (
    <div className="space-y-2" data-testid="agent-commission-rate">
      <Label htmlFor={inputId}>{t('label')}</Label>
      <Input
        id={inputId}
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step="0.01"
        value={valeur}
        disabled={setRate.isPending}
        onChange={(e) => setValeur(e.target.value)}
        aria-describedby={`${inputId}-hint`}
      />
      <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
        {t('hint')}
      </p>

      {setRate.error ? (
        <p className="text-xs text-destructive" role="alert">
          {messageErreur(setRate.error)}
        </p>
      ) : null}

      {dirty ? (
        <Button size="sm" disabled={setRate.isPending} onClick={submit}>
          {setRate.isPending ? (
            <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {setRate.isPending ? t('submitting') : t('submit')}
        </Button>
      ) : null}
    </div>
  );
}
