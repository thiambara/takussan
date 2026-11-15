'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSetAgentCommissionRate } from '@/lib/queries/agency-roles';
import type { AgencyRoleAssignment } from '@/types/agency-role';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface AgentCommissionRateFieldProps {
  /** Le profil d'agent de ce membre DANS cette agence, avec son taux. */
  readonly assignment: AgencyRoleAssignment;
  /**
   * TCK-2667 — `ligne` : la rangée de la fiche du membre (maquette `app-equipe`, a, « Fiche ») — le
   * taux en place dans un bouton « 40 % ✎ », qui ouvre le champ ; « Enregistrer le taux » et
   * « Annuler » dessous. La règle est la même : rien ne part sans le bouton.
   */
  readonly disposition?: 'bloc' | 'ligne';
  /** Les textes de la rangée (`ligne`), que la fiche fournit. */
  readonly ligne?: {
    readonly libelle: string;
    readonly detail?: string;
    /** Le taux en place, tel qu'il s'affiche (« 40 % », « Aucun »). */
    readonly valeur: string;
    /** Le nom accessible du bouton qui ouvre le champ. */
    readonly modifier: string;
  };
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
export function AgentCommissionRateField({ assignment, disposition = 'bloc', ligne }: AgentCommissionRateFieldProps) {
  const t = useTranslations('admin.roles.commissionRate');
  const tCommon = useTranslations('common.actions');
  const [edition, setEdition] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  // Le champ s'ouvre sur un geste : il prend le focus à ce moment-là, pas au montage de la fiche.
  useEffect(() => {
    if (edition) champ.current?.focus();
  }, [edition]);
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
      { onError: () => setValeur(enPlace), onSuccess: () => setEdition(false) },
    );
  };

  const inputId = `agent-commission-rate-${assignment.profile_id}`;

  if (disposition === 'ligne' && ligne) {
    const annuler = () => {
      setValeur(enPlace);
      setEdition(false);
    };
    return (
      <div
        className="flex min-h-[3.25rem] flex-col justify-center border-b border-border/70 px-4 py-2.5 last:border-b-0"
        data-testid="agent-commission-rate"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {edition ? (
              <Label htmlFor={inputId} className="text-ui font-normal text-muted-foreground">
                {ligne.libelle}
              </Label>
            ) : (
              <p className="text-ui text-muted-foreground">{ligne.libelle}</p>
            )}
            {ligne.detail ? (
              <p id={`${inputId}-hint`} className="text-ui text-muted-foreground">
                {ligne.detail}
              </p>
            ) : null}
          </div>
          {edition ? (
            <span className="inline-flex flex-none items-center gap-1.5">
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
                aria-describedby={ligne.detail ? `${inputId}-hint` : undefined}
                className="w-20 text-right tabular-nums"
                ref={champ}
              />
              <span className="text-sm font-semibold" aria-hidden="true">
                %
              </span>
            </span>
          ) : (
            <Button
              variant="outline"
              onClick={() => setEdition(true)}
              aria-label={ligne.modifier}
              className="h-9 flex-none gap-2 bg-card px-3 font-semibold tabular-nums"
            >
              {ligne.valeur}
              <Pencil className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </Button>
          )}
        </div>
        {setRate.error ? (
          <p className="mt-1.5 text-xs text-destructive" role="alert">
            {messageErreur(setRate.error)}
          </p>
        ) : null}
        {edition ? (
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={setRate.isPending} onClick={annuler}>
              {tCommon('cancel')}
            </Button>
            <Button size="sm" disabled={setRate.isPending || !dirty} onClick={submit}>
              {setRate.isPending ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" /> : null}
              {setRate.isPending ? t('submitting') : t('submit')}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

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
          {setRate.isPending ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" /> : null}
          {setRate.isPending ? t('submitting') : t('submit')}
        </Button>
      ) : null}
    </div>
  );
}
