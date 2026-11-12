'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { jourDeLInstant } from '@/lib/commissions/vue';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  SOLDE_MAX,
  useCommissionEntries,
  useMarkCommissionPaid,
  useSettleCommissions,
  type CommissionEntry,
} from '@/lib/queries/commissions';
import { cn } from '@/lib/utils';

import { ChampsDeLaPreuve, DialogueDeGeste, erreursDeChamp, preuveAEnvoyer, preuveComplete, usePreuve } from './gestes';
import { useLectureDeCommission } from './pieces';

/**
 * TCK-2662 — payer une commission, ou solder un agent.
 *
 * « Solder » : les lignes dues du bénéficiaire, les plus anciennes d'abord, toutes cochées — on
 * décoche celles qu'on ne paie pas aujourd'hui ; le total se recalcule et le bouton l'annonce ;
 * `POST /api/commissions/settle` part avec les SEULES lignes cochées (AC3). Au téléphone, un écran
 * plein (l'en-tête « ✕ », le total et le bouton dans la barre collante) ; au bureau, le dialogue
 * large. Au plus {@link SOLDE_MAX} lignes par solde : au-delà, l'écran le dit.
 *
 * « Marquer payée » (une ligne, menu « … ») : le même formulaire, sans liste, par `mark-paid`.
 */

/** Le jour le plus récent où une des lignes est née : un paiement ne la précède pas (`paid_before_earned`). */
function premierJourPossible(lignes: readonly CommissionEntry[]): string | null {
  let min: string | null = null;
  for (const l of lignes) {
    const j = jourDeLInstant(l.earned_at);
    if (j && (min === null || j > min)) min = j;
  }
  return min;
}

function LignesASolder({
  lignes,
  decochees,
  basculer,
  bureau,
}: {
  readonly lignes: readonly CommissionEntry[];
  readonly decochees: ReadonlySet<number>;
  readonly basculer: (id: number) => void;
  readonly bureau: boolean;
}) {
  const l = useLectureDeCommission();
  return (
    <ul className={cn('divide-y divide-border rounded-lg border border-border', !bureau && 'bg-card')}>
      {lignes.map((e) => (
        <li key={e.id}>
          <label className="flex min-h-[3.75rem] cursor-pointer items-center gap-3 px-3.5 py-2.5">
            <Checkbox checked={!decochees.has(e.id)} onCheckedChange={() => basculer(e.id)} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-corps font-medium">{l.bien(e)}</span>
              <span className="mt-0.5 block truncate text-ui text-muted-foreground">
                {[l.part(e), bureau ? l.role(e) : null, l.jour(e.earned_at)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="flex-none text-corps font-semibold tabular-nums">{l.montant(e)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Avis({ nom }: { readonly nom: string }) {
  const t = useTranslations('commissions.payer');
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-success/10 px-3 py-2.5 text-ui leading-snug">
      <Check className="mt-px size-4 flex-none text-success" aria-hidden="true" />
      <span className="min-w-0 flex-1">{t('avis', { nom })}</span>
    </div>
  );
}

export function Solder({
  beneficiaire,
  bureau,
  onFermer,
}: {
  readonly beneficiaire: { readonly id: number; readonly nom: string };
  readonly bureau: boolean;
  readonly onFermer: () => void;
}) {
  const t = useTranslations('commissions');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const query = useCommissionEntries({ status: 'due', beneficiaryId: beneficiaire.id, sort: 'earned_at', perPage: SOLDE_MAX });
  const solder = useSettleCommissions();
  const { etat, poser } = usePreuve();
  const [decochees, setDecochees] = useState<ReadonlySet<number>>(() => new Set());
  const [erreur, setErreur] = useState<unknown>(null);

  const lignes = query.data?.data ?? [];
  const cochees = lignes.filter((e) => !decochees.has(e.id));
  const total = cochees.reduce((s, e) => s + e.amount, 0);
  const devise = lignes[0]?.currency || 'XOF';
  const montant = f.montantCourt(total, devise);
  const tronque = (query.data?.meta.total ?? 0) > lignes.length;
  const min = premierJourPossible(cochees);
  const pret = cochees.length > 0 && preuveComplete(etat, min) && !solder.isPending;
  const champs = erreursDeChamp(erreur);
  const nbDues = query.data?.meta.total ?? lignes.length;

  const basculer = (id: number) =>
    setDecochees((avant) => {
      const suite = new Set(avant);
      if (suite.has(id)) suite.delete(id);
      else suite.add(id);
      return suite;
    });

  const confirmer = async () => {
    if (!pret) return;
    setErreur(null);
    try {
      await solder.mutateAsync({ beneficiary_id: beneficiaire.id, entry_ids: cochees.map((e) => e.id), ...preuveAEnvoyer(etat) });
      onFermer();
    } catch (e) {
      setErreur(e);
    }
  };

  const alerte =
    erreur && !champs.paid_at && !champs.payment_reference && !champs.payment_method ? (
      <p role="alert" className="mt-4 text-sm text-destructive">
        {messageErreur(erreur, t('actionFailed'))}
      </p>
    ) : null;

  const corps = query.isLoading ? (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-14 rounded-lg" />
      ))}
    </div>
  ) : lignes.length === 0 ? (
    <p className="text-sm text-muted-foreground">{t('payer.aucune')}</p>
  ) : (
    <>
      {!bureau ? <p className="mb-2 text-sm font-medium">{t('payer.lignesPayees')}</p> : null}
      <LignesASolder lignes={lignes} decochees={decochees} basculer={basculer} bureau={bureau} />
      {tronque ? <p className="mt-2 text-ui text-muted-foreground">{t('payer.tronque', { max: SOLDE_MAX })}</p> : null}
      <div className="mt-5">
        <ChampsDeLaPreuve etat={etat} poser={poser} min={min} erreurs={champs} bureau={bureau} />
      </div>
      {!bureau ? (
        <div className="mt-5">
          <Avis nom={beneficiaire.nom} />
        </div>
      ) : null}
      {alerte}
    </>
  );

  const confirmerLibelle = t('payer.confirmer', { montant });

  if (bureau) {
    return (
      <DialogueDeGeste
        ouvert
        onFermer={onFermer}
        largeur="large"
        titre={t('payer.titreSolde', { nom: beneficiaire.nom })}
        sousTitre={`${t('payer.dues', { count: nbDues })} · ${t('payer.decocher')}`}
        pied={
          <>
            <span className="mr-auto text-sm text-muted-foreground">
              {t('payer.total', { count: cochees.length })}{' '}
              <span className="ml-2 font-display text-xl font-semibold text-foreground tabular-nums">{montant}</span>
            </span>
            <Button type="button" variant="ghost" onClick={onFermer}>
              {t('payer.fermer')}
            </Button>
            <Button type="button" disabled={!pret} onClick={() => void confirmer()}>
              {confirmerLibelle}
            </Button>
          </>
        }
      >
        <div className="px-6 py-5">{corps}</div>
      </DialogueDeGeste>
    );
  }

  return (
    <PagePleineLargeur data-slot="solder" className="pt-4 pb-8">
      <DeclarerEnTete forme="plein-ecran" titre={t('payer.titreSolde', { nom: beneficiaire.nom })} sousTitre={t('payer.dues', { count: nbDues })} repli="/app/commissions" />
      <div className="px-4">{corps}</div>
      <BarreDAction taille="action">
        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <p className="text-sm text-muted-foreground">{t('payer.total', { count: cochees.length })}</p>
            <p className="font-display text-xl font-semibold tabular-nums">{montant}</p>
          </div>
          <Button type="button" size="xl" className="w-full" disabled={!pret} onClick={() => void confirmer()}>
            {confirmerLibelle}
          </Button>
        </div>
      </BarreDAction>
    </PagePleineLargeur>
  );
}

/** « Marquer payée » : la preuve d'UNE ligne (`mark-paid`). */
export function MarquerPayee({ e, bureau, onFermer }: { readonly e: CommissionEntry | null; readonly bureau: boolean; readonly onFermer: () => void }) {
  const t = useTranslations('commissions');
  const l = useLectureDeCommission();
  const messageErreur = useMessageErreurApi();
  const payer = useMarkCommissionPaid();
  const { etat, poser } = usePreuve();
  const [erreur, setErreur] = useState<unknown>(null);
  if (!e) return null;
  const nom = e.beneficiary?.name || t('admin.sansNom', { id: e.beneficiary_id });
  const montant = l.montant(e);
  const min = jourDeLInstant(e.earned_at);
  const pret = preuveComplete(etat, min) && !payer.isPending;
  const champs = erreursDeChamp(erreur);
  const fermer = () => {
    setErreur(null);
    onFermer();
  };
  const confirmer = async () => {
    if (!pret) return;
    setErreur(null);
    try {
      await payer.mutateAsync({ id: e.id, ...preuveAEnvoyer(etat) });
      fermer();
    } catch (err) {
      setErreur(err);
    }
  };
  const corps = (
    <>
      <ChampsDeLaPreuve etat={etat} poser={poser} min={min} erreurs={champs} bureau={false} />
      <div className="mt-5">
        <Avis nom={nom} />
      </div>
      {erreur && !champs.paid_at && !champs.payment_reference && !champs.payment_method ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {messageErreur(erreur, t('actionFailed'))}
        </p>
      ) : null}
    </>
  );
  const bouton = (
    <Button type="button" size={bureau ? 'default' : 'xl'} className={bureau ? undefined : 'w-full'} disabled={!pret} onClick={() => void confirmer()}>
      {t('payer.confirmer', { montant })}
    </Button>
  );
  if (bureau) {
    return (
      <DialogueDeGeste
        ouvert
        onFermer={fermer}
        largeur="etroit"
        titre={t('payer.titreLigne')}
        sousTitre={t('annuler.sousTitre', { bien: l.bien(e), montant, nom })}
        pied={
          <>
            <Button type="button" variant="ghost" onClick={fermer}>
              {t('payer.fermer')}
            </Button>
            {bouton}
          </>
        }
      >
        <div className="px-6 py-5">{corps}</div>
      </DialogueDeGeste>
    );
  }
  return (
    <FeuilleDuBas open onOpenChange={(o) => (o ? undefined : fermer())} titre={t('payer.titreLigne')} pied={bouton}>
      <p className="mb-4 text-corps leading-relaxed text-encre-douce">
        <span className="font-semibold text-foreground">{l.bien(e)}</span> — {t('annuler.duA', { montant, nom })}
      </p>
      {corps}
    </FeuilleDuBas>
  );
}
