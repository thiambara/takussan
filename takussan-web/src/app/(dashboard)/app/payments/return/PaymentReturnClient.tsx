'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { FilDAriane } from '@/components/console/PageHeader';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PaymentProviderPicker } from '@/components/payments/PaymentProviderPicker';
import { CarteDuRetour } from '@/components/payments/retour/CarteDuRetour';
import { issueDuRetour, lireLeLien } from '@/components/payments/retour/issue-du-retour';
import { useVerifyPayment, type GatewayPaymentType, type VerifyPaymentResult } from '@/hooks/useInitiatePayment';
import { ApiError } from '@/lib/api';
import { useResumeDuLoyer } from '@/lib/queries/payments';
import type { ApiResponse } from '@/types/api';

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_DURATION_MS = 120_000; // 2 min
const MIN_LOADING_MS = 800;

/** La réponse de `verify` et, faute de réponse, le code de sa dernière erreur (`0` : réseau). */
function lireLaVerification(donnees: ApiResponse<VerifyPaymentResult> | undefined, erreur: unknown) {
  const serveur = donnees?.data ?? null;
  return {
    serveur,
    erreur: serveur !== null || !erreur ? null : erreur instanceof ApiError ? erreur.status : 0,
  };
}

/**
 * TCK-2650 — le retour de passerelle. L'issue est décidée par {@link issueDuRetour} : le statut
 * SERVEUR d'abord, l'adresse jamais pour un succès (P1 de l'audit). « Vérification… » au moins
 * 800 ms, puis interrogation toutes les 15 s pendant 2 min, tant que l'issue n'est pas définitive.
 */
function PaymentReturnInner() {
  const t = useTranslations('payments.retour');
  const tConsole = useTranslations('console.pageHeader');
  const params = useSearchParams();

  const lien = lireLeLien(params);
  const indice = params.get('status');

  const [chargementMinimal, setChargementMinimal] = useState(true);
  const [epuise, setEpuise] = useState(false);
  const [relance, setRelance] = useState(0);
  const [reessai, setReessai] = useState(false);

  useEffect(() => {
    const minuteur = setTimeout(() => setChargementMinimal(false), MIN_LOADING_MS);
    return () => clearTimeout(minuteur);
  }, []);

  // Aucune requête pour une adresse illisible : `enabled` ne s'ouvre que sur un lien lu. L'interrogation
  // relit la dernière réponse et s'arrête sur une issue définitive.
  const verify = useVerifyPayment((lien?.type ?? 'lease-payments') as GatewayPaymentType, lien?.id ?? null, {
    enabled: lien !== null,
    refetchInterval: (requete) =>
      lien !== null && !epuise && !issueDuRetour({ lien, ...lireLaVerification(requete.state.data, requete.state.error), indice }).terminale
        ? POLL_INTERVAL_MS
        : false,
  });
  const { serveur, erreur } = lireLaVerification(verify.data, verify.error);
  const decision = issueDuRetour({ lien, serveur, erreur, indice });
  const interroge = lien !== null && !epuise && !decision.terminale;
  const lienLu = lien !== null;

  // Le budget de 2 minutes : un seul minuteur par relance (« Vérifier à nouveau » le réarme).
  useEffect(() => {
    if (!lienLu || decision.terminale) return;
    const minuteur = setTimeout(() => setEpuise(true), MAX_POLL_DURATION_MS);
    return () => clearTimeout(minuteur);
  }, [lienLu, decision.terminale, relance]);

  // Le téléphone de l'agence, pour « Contacter l'agence » au remboursement (locataire seulement).
  const resume = useResumeDuLoyer({ enabled: decision.issue === 'rembourse' && lien?.type === 'lease-payments' });

  const enVerification = chargementMinimal || (lien !== null && serveur === null && erreur === null);

  return (
    <div data-slot="retour-de-paiement">
      <DeclarerEnTete forme="detail" titre={t('titre')} repli="/app/payments" />
      <FilDAriane
        label={tConsole('breadcrumb')}
        etapes={[{ label: t('fil.paiements'), href: '/app/payments' }, { label: t('fil.retour') }]}
      />
      <p className="mb-6 font-display text-2xl font-semibold tracking-titre text-foreground max-md:hidden">{t('titre')}</p>
      <div className="flex justify-center pb-16 max-md:pt-6 md:pt-4">
        <div className="w-full max-w-120 md:rounded-2xl md:border md:border-border md:bg-card md:p-8">
          {enVerification ? (
            <div className="flex flex-col items-center py-10 text-center" role="status" aria-live="polite">
              <Loader2 className="size-10 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              <p className="mt-4 text-corps text-muted-foreground">{t('verification')}</p>
            </div>
          ) : (
            <CarteDuRetour
              issue={decision.issue}
              lien={lien}
              paiement={serveur?.payment ?? null}
              statutServeur={serveur?.status ?? null}
              interroge={interroge}
              epuise={epuise}
              onVerifierANouveau={() => {
                setEpuise(false);
                setRelance((n) => n + 1);
                void verify.refetch();
              }}
              onReessayer={() => setReessai(true)}
              telephoneDeLAgence={resume.data?.data?.lease?.agency?.phone ?? resume.data?.data?.offline_payment?.agency_phone ?? null}
            />
          )}
        </div>
      </div>
      {lien !== null && reessai ? (
        <PaymentProviderPicker
          open={reessai}
          onOpenChange={setReessai}
          paymentType={lien.type}
          paymentId={lien.id}
          currency={serveur?.payment?.currency ?? 'XOF'}
        />
      ) : null}
    </div>
  );
}

export function PaymentReturnClient() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">…</div>}>
      <PaymentReturnInner />
    </Suspense>
  );
}
