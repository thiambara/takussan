'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Controller, useFormContext } from 'react-hook-form';
import { ChevronRight, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { confirmPayoutThresholdAction } from '@/app/actions/admin-agency';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import type { ValeursDeLaFiche } from '@/lib/agence/fiche';
import { avecGardeDoubleFacteurAction } from '@/lib/double-facteur';
import { formatMontant, type CurrencyCode } from '@/lib/format/currency';
import { DOUBLE_FACTEUR_DE_L_EQUIPE_KEY, fetchDoubleFacteurDeLEquipe } from '@/lib/queries/admin-users';
import { propertyModerationCountQueryOptions } from '@/lib/queries/agency-queues';

import { ChampDeLaFiche } from './champs';
import { useFiche } from './contexte';
import { GroupeDeChamps, InterrupteurAAide, TitreDeSection } from './pieces';

/**
 * TCK-2670 — « Règles de l'agence » : modération obligatoire (et la file qui attend), pénalités
 * encaissées en ligne, seuil d'approbation des reversements (et le relèvement en attente d'un second
 * approbateur), double authentification obligatoire (et les membres qui ne l'ont pas). Une agence
 * individuelle n'a que les pénalités : ni file de modération (TCK-686), ni équipe (TCK-2487).
 */
export function SectionRegles() {
  const tFiche = useTranslations('admin.agencyConfig.fiche.regles');
  const { individuelle } = useFiche();
  // TCK-594 — le serveur décide (`AgencyPolicy::updatePayoutThreshold`) ; ceci évite seulement de
  // proposer un champ qui rendrait 403.
  const { can: peutRegler } = useCan('payouts.approve');

  const publication = (
    <GroupeDeChamps titre={tFiche('groupePublication')}>
      {individuelle ? null : <Moderation />}
      <Penalites />
    </GroupeDeChamps>
  );
  const reversements = peutRegler ? (
    <GroupeDeChamps titre={tFiche('groupeReversements')}>
      <Seuil />
    </GroupeDeChamps>
  ) : null;
  const securite = individuelle ? null : (
    <GroupeDeChamps titre={tFiche('groupeSecurite')}>
      <DoubleAuthentification />
    </GroupeDeChamps>
  );

  return (
    <section aria-labelledby="titre-section-regles" data-section="regles">
      <TitreDeSection id="titre-section-regles" titre={tFiche('titre')} texte={tFiche('texte')} />
      <div className="flex flex-col gap-5 md:grid md:grid-cols-2 md:items-start">
        <div className="space-y-5">{publication}</div>
        {reversements || securite ? (
          <div className="space-y-5">
            {reversements}
            {securite}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LienDePied({ compte, lien, href }: { readonly compte: React.ReactNode; readonly lien: string; readonly href: string }) {
  return (
    <>
      <span className="min-w-0 flex-1 text-encre-douce">{compte}</span>
      <Link href={href} className="inline-flex min-h-11 flex-none items-center gap-0.5 font-medium text-primary hover:underline">
        {lien}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </>
  );
}

function Moderation() {
  const t = useTranslations('admin.agencyConfig.moderation');
  const tFiche = useTranslations('admin.agencyConfig.fiche.regles');
  const { control } = useFormContext<ValeursDeLaFiche>();
  const { token } = useAuth();
  const options = propertyModerationCountQueryOptions(token ?? null, true);
  const { data: enAttente } = useQuery(options);
  return (
    <Controller
      control={control}
      name="moderation_required"
      render={({ field }) => (
        <InterrupteurAAide
          id="moderation_required"
          libelle={t('label')}
          aide={t('hint')}
          actif={field.value}
          onChange={field.onChange}
          pied={
            enAttente && enAttente > 0 ? (
              <LienDePied
                compte={tFiche('biensEnAttente', { n: enAttente })}
                lien={tFiche('ouvrirLaFile')}
                href="/app/agency/moderation/properties"
              />
            ) : undefined
          }
        />
      )}
    />
  );
}

function Penalites() {
  const t = useTranslations('admin.agencyConfig.lateFeeOnline');
  const { control } = useFormContext<ValeursDeLaFiche>();
  return (
    <Controller
      control={control}
      name="late_fee_online_collection"
      render={({ field }) => (
        <InterrupteurAAide id="late_fee_online_collection" libelle={t('label')} aide={t('hint')} actif={field.value} onChange={field.onChange} />
      )}
    />
  );
}

function Seuil() {
  const tMoney = useTranslations('admin.agencyConfig.moneyOut');
  const tFiche = useTranslations('admin.agencyConfig.fiche.regles');
  const format = useFormatter();
  const router = useRouter();
  const garde = useGardeDoubleFacteur();
  const { user } = useAuth();
  const { agence, annoncer } = useFiche();
  const enAttente = agence.pending_payout_threshold_change ?? null;
  const devise = (agence.currency ?? 'XOF').toUpperCase() as CurrencyCode;
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function confirmer() {
    setErreur(null);
    demarrer(async () => {
      // VERIF-594 passe 2, N-5 — on confirme la valeur AFFICHÉE ; remplacée entre-temps, le serveur rend 409.
      const resultat = await avecGardeDoubleFacteurAction(
        () => confirmPayoutThresholdAction(agence.id, enAttente?.threshold ?? null),
        garde,
      );
      if (!resultat.ok) {
        setErreur(resultat.message);
        return;
      }
      annoncer(tMoney('thresholdConfirmed'));
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <ChampDeLaFiche name="payout_approval_threshold" libelle={tMoney('threshold')} inputMode="numeric" aide={tMoney('thresholdHint')} />
      {enAttente ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3" role="status">
          <p className="text-pretty text-sm">
            {enAttente.threshold == null
              ? tMoney('thresholdPendingOff')
              : tMoney('thresholdPendingRaise', { threshold: formatMontant(enAttente.threshold, devise) })}
          </p>
          <div className="mt-2.5 flex items-center gap-3">
            {user != null && enAttente.requested_by_id === user.id ? (
              <p className="min-w-0 flex-1 text-pretty text-xs text-muted-foreground">{tMoney('thresholdPendingSelf')}</p>
            ) : (
              <>
                <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
                  {enAttente.requested_at
                    ? tFiche('demandeeLe', { date: format.dateTime(new Date(enAttente.requested_at), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
                    : null}
                </p>
                <Button type="button" className="h-11 flex-none px-5" disabled={enCours} onClick={confirmer}>
                  {enCours ? tMoney('thresholdConfirming') : tMoney('thresholdConfirm')}
                </Button>
              </>
            )}
          </div>
          {erreur ? <p className="mt-2 text-sm text-destructive">{erreur}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function DoubleAuthentification() {
  const t = useTranslations('admin.agencyConfig.security');
  const tFiche = useTranslations('admin.agencyConfig.fiche.regles');
  const { control } = useFormContext<ValeursDeLaFiche>();
  const { data: equipe } = useQuery({
    queryKey: DOUBLE_FACTEUR_DE_L_EQUIPE_KEY,
    queryFn: fetchDoubleFacteurDeLEquipe,
    staleTime: 60_000,
  });
  return (
    <Controller
      control={control}
      name="require_team_two_factor"
      render={({ field }) => (
        <InterrupteurAAide
          id="require_team_two_factor"
          libelle={t('teamTwoFactorLabel')}
          aide={t('teamTwoFactorHint')}
          actif={field.value}
          onChange={field.onChange}
          pied={
            equipe && equipe.sans > 0 ? (
              <LienDePied
                compte={
                  <>
                    <ShieldCheck className="mr-1.5 inline size-4 text-warning" strokeWidth={1.75} aria-hidden="true" />
                    {equipe.lus < equipe.total
                      ? tFiche('membresSansDoubleFacteurAuMoins', { n: equipe.sans, total: equipe.total })
                      : tFiche('membresSansDoubleFacteur', { n: equipe.sans, total: equipe.total })}
                  </>
                }
                lien={tFiche('voirLEquipe')}
                href="/app/agency/team"
              />
            ) : undefined
          }
        />
      )}
    />
  );
}
