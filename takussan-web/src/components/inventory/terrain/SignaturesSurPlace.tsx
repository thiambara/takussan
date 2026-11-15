'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { CasesDuCode, LONGUEUR_DU_CODE } from '@/components/auth/CasesDuCode';
import { StatusBadge } from '@/components/console/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { inventoryKeys, useEnvoyerCodeSurPlace, useSignInventory } from '@/lib/queries/inventory';
import { cn } from '@/lib/utils';
import type { Inventory } from '@/types/inventory';

import { SignaturePad } from '../SignaturePad';

/**
 * TCK-2648 (ADR-0098) — les deux signatures recueillies SUR PLACE, sur le téléphone de l'agent
 * (maquette `app-etats-des-lieux`, approche A, écran a-2 : `SignatureLocataire`, `SignatureAgence`).
 *
 *  · le LOCATAIRE trace sa signature plein écran, puis dit le code reçu par SMS
 *    (`POST …/sign/onsite-code`) ; le tracé et les six chiffres partent ensemble
 *    (`POST …/sign`, `role=tenant`, `code`, `signature`). Un code faux se dit sous les cases, le
 *    tracé reste ;
 *  · l'AGENCE signe pour le bailleur (`role=landlord`), au titre du mandat (`sign_on_behalf_of`).
 *
 * Qui peut quoi, l'API le dit (`can_sign_as`) : `tenant_onsite` ouvre le bloc du locataire, `landlord`
 * celui de l'agence. Rien ne se déduit des rôles du compte.
 */

/** Le délai de renvoi de l'API (`SignatureOtpService::RESEND_COOLDOWN_SECONDS`). */
export const DELAI_DE_RENVOI_MS = 60_000;

/**
 * « d'Aminata » mais « de Moussa » : l'élision du français devant une voyelle. Pas devant un « y »
 * consonne (« de Yacine », « de Yaye »), ni devant un h (muet ou non, on ne le sait pas d'un prénom).
 */
export function elide(prenom: string): boolean {
  return /^[aeiouàâäéèêëîïôöùûüœæ]/i.test(prenom.normalize('NFC'));
}

function codeDeLApi(erreur: unknown): string | undefined {
  if (!(erreur instanceof ApiError)) return undefined;
  const code = erreur.data && typeof erreur.data === 'object' ? (erreur.data as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : undefined;
}

/** « 0:42 » */
function delai(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Le tracé plein écran au téléphone (une fenêtre au bureau) : « Effacer » puis « Valider », 44 px chacun. */
export function TracePleinEcran({
  ouvert,
  onOpenChange,
  titre,
  onValider,
}: {
  readonly ouvert: boolean;
  readonly onOpenChange: (ouvert: boolean) => void;
  readonly titre: string;
  readonly onValider: (trace: string) => void;
}) {
  const t = useTranslations('inventory.terrain.signatures.trace');
  return (
    <Dialog open={ouvert} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="trace-plein-ecran"
        className={cn(
          'flex flex-col gap-3',
          // Au téléphone, tout l'écran : le doigt a la place de signer, et le paysage la double.
          'max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:p-4',
          'md:h-[min(34rem,90dvh)] md:max-w-2xl sm:max-w-2xl',
        )}
      >
        <div className="pr-10">
          <DialogTitle className="text-base font-semibold">{titre}</DialogTitle>
          <DialogDescription className="mt-0.5 text-ui text-muted-foreground">
            {t('aide')} <span className="landscape:hidden md:hidden">{t('paysage')}</span>
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1">
          <SignaturePad
            grand
            label={titre}
            helperText=""
            clearLabel={t('effacer')}
            confirmLabel={t('valider')}
            onConfirm={(trace) => {
              onValider(trace);
              onOpenChange(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Le tracé gardé, en vignette, avec « Refaire ». */
function TraceGardee({ trace, nom, onRefaire, desactive }: { readonly trace: string; readonly nom: string; readonly onRefaire: () => void; readonly desactive?: boolean }) {
  const t = useTranslations('inventory.terrain.signatures');
  return (
    <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
      {/* Un `data:` produit par le canevas : ni `next/image` ni son optimiseur n'y ont rien à faire. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={trace} alt={t('traceDe', { nom })} className="h-14 w-auto max-w-[70%] object-contain" />
      <Button type="button" variant="link" className="h-auto p-0 text-ui font-medium plancher-tactile-10" onClick={onRefaire} disabled={desactive}>
        {t('refaire')}
      </Button>
    </div>
  );
}

/** « Signer ici » : 56 px, plein, sombre (maquette). */
function BoutonSignerIci({ onClick, desactive }: { readonly onClick: () => void; readonly desactive?: boolean }) {
  const t = useTranslations('inventory.terrain.signatures');
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={desactive}
      className="mt-3 h-14 w-full gap-2.5 rounded-xl bg-foreground text-base font-semibold text-background hover:bg-foreground/90"
    >
      <PenLine className="size-5" strokeWidth={1.75} aria-hidden />
      {t('signerIci')}
    </Button>
  );
}

export interface SignatureDuLocataireProps {
  readonly inventory: Inventory;
  /** « Aminata Diop » ; « Aminata » pour « Code reçu par Aminata ». */
  readonly nom: string;
  readonly prenom: string;
  /** Avant le premier geste : fige le contenu (soumission d'un brouillon). `false` : le geste s'arrête, l'erreur est dite par l'appelant. */
  readonly avantDeSigner: () => Promise<string | null>;
  /** Le code est-il parti ? Pour la ligne « Il manque le code d'Aminata ». */
  readonly onEtat?: (etat: { readonly codeEnvoye: boolean }) => void;
}

/** Le bloc « Locataire · {nom} » : tracé, code SMS, signature sur place. */
export function SignatureDuLocataire({ inventory, nom, prenom, avantDeSigner, onEtat }: SignatureDuLocataireProps) {
  const t = useTranslations('inventory.terrain.signatures');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const envoyer = useEnvoyerCodeSurPlace(inventory.id);
  const signer = useSignInventory(inventory.id);

  const [trace, setTrace] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState<{ readonly destination: string | null; readonly a: number } | null>(null);
  const [code, setCode] = useState('');
  const [erreurCode, setErreurCode] = useState<string | null>(null);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [verrouille, setVerrouille] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  // Le dernier code que l'API a REFUSÉ (422 sur `code`) pour ce SMS : il ne repart pas, chaque essai faux
  // compte pour le verrou. La clé est le code SEUL — « Refaire » donne une autre image, et le code
  // refusé repartait avec elle (r2 de la contre-vérification de 065941306). Une panne de transport
  // n'est pas un verdict : le même code peut repartir, et « Réessayer » le dit (r3).
  const codeRefuse = useRef<string | null>(null);
  const enVol = useRef(false);
  const [echecDeTransport, setEchecDeTransport] = useState(false);

  const restant = envoi ? Math.max(0, envoi.a + DELAI_DE_RENVOI_MS - maintenant) : 0;
  useEffect(() => {
    if (!envoi || restant <= 0) return;
    const minuteur = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(minuteur);
  }, [envoi, restant]);

  const demanderLeCode = async () => {
    setErreurEnvoi(null);
    const refus = await avantDeSigner();
    if (refus !== null) {
      setErreurEnvoi(refus);
      return;
    }
    try {
      const reponse = await envoyer.mutateAsync();
      setEnvoi({ destination: reponse.data.destination, a: Date.now() });
      onEtat?.({ codeEnvoye: true });
      setMaintenant(Date.now());
      setCode('');
      setErreurCode(null);
      setEchecDeTransport(false);
      codeRefuse.current = null;
    } catch (erreur) {
      // Un code est déjà parti il y a moins d'une minute (une page rechargée l'a oublié) : les cases
      // s'ouvrent quand même, le code reçu reste bon.
      if (erreur instanceof ApiError && erreur.status === 429 && codeDeLApi(erreur) === 'inventory_signature.resend_too_soon') {
        setEnvoi((avant) => avant ?? { destination: null, a: Date.now() });
        setMaintenant(Date.now());
        onEtat?.({ codeEnvoye: true });
      }
      if (erreur instanceof ApiError && erreur.status === 423) setVerrouille(true);
      setErreurEnvoi(messageErreur(erreur, t('envoiImpossible')));
    }
  };

  // Le tracé ET les six chiffres partent ensemble, au geste qui complète le second — le sixième
  // chiffre, ou « Valider » du tracé quand le code était déjà saisi.
  const tenter = (codeSaisi: string, traceGardee: string | null) => {
    if (!traceGardee || codeSaisi.length !== LONGUEUR_DU_CODE || signer.isPending || verrouille || enVol.current) return;
    if (codeRefuse.current === codeSaisi) return;
    enVol.current = true;
    setErreurCode(null);
    setEchecDeTransport(false);
    signer
      .mutateAsync({ role: 'tenant', signature: traceGardee, code: codeSaisi })
      .catch((erreur: unknown) => {
        const verdict = erreur instanceof ApiError && erreur.status >= 400 && erreur.status < 500 && ![401, 408, 429].includes(erreur.status);
        if (erreur instanceof ApiError && verdict) {
          // Le code faux est une erreur de validation du champ `code` (422) ; le verrou, un 423 codé.
          const champ = erreur.validationErrors?.code?.[0];
          if (champ) codeRefuse.current = codeSaisi;
          if (erreur.status === 423) setVerrouille(true);
          // Déjà signé (un autre téléphone, le compte du locataire) : la fiche se relit.
          if (erreur.status === 409) void queryClient.invalidateQueries({ queryKey: inventoryKeys.detail(inventory.id) });
          setErreurCode(champ ?? messageErreur(erreur, t('signatureImpossible')));
          return;
        }
        setEchecDeTransport(true);
        setErreurCode(t('signatureImpossible'));
      })
      .finally(() => {
        enVol.current = false;
      });
  };

  if (inventory.tenant_signed) {
    const heure = inventory.tenant_signed_at ? f.heure(inventory.tenant_signed_at) : null;
    return (
      <BlocDeSignature titre={t('locataire', { nom })} statut={<StatusBadge tone="success" label={t('statut.signe')} />}>
        <p className="mt-1 text-ui text-muted-foreground">
          {inventory.tenant_signature_method === 'onsite_otp'
            ? t('signeSurPlace', { heure: heure ?? '' })
            : heure
              ? t('signeDepuisSonCompte', { heure })
              : t('statut.signe')}
        </p>
      </BlocDeSignature>
    );
  }

  const idCode = `code-sur-place-${inventory.id}`;
  const idErreur = `${idCode}-erreur`;
  const enAttenteDuCode = envoi !== null;

  return (
    <BlocDeSignature
      titre={t('locataire', { nom })}
      statut={enAttenteDuCode ? <StatusBadge tone="attention" label={t('statut.codeAttendu')} /> : <StatusBadge tone="neutral" label={t('statut.aSigner')} />}
    >
      {trace ? (
        <TraceGardee trace={trace} nom={nom} onRefaire={() => setOuvert(true)} desactive={signer.isPending} />
      ) : (
        <BoutonSignerIci onClick={() => setOuvert(true)} />
      )}
      <TracePleinEcran
        ouvert={ouvert}
        onOpenChange={setOuvert}
        titre={t('trace.titre', { nom })}
        onValider={(nouvelle) => {
          setTrace(nouvelle);
          tenter(code, nouvelle);
        }}
      />

      {enAttenteDuCode ? (
        <div className="mt-4">
          <label htmlFor={idCode} className="mb-2 block text-sm">
            {envoi.destination ? (
              t.rich('codeRecuPar', {
                prenom,
                destination: envoi.destination,
                numero: (morceaux) => <span className="whitespace-nowrap font-medium tabular-nums">{morceaux}</span>,
              })
            ) : (
              t('codeEnvoyeA', { prenom })
            )}
          </label>
          <CasesDuCode
            id={idCode}
            valeur={code}
            onChange={(v) => {
              setCode(v);
              if (erreurCode && v !== code) setErreurCode(null);
              tenter(v, trace);
            }}
            erreur={erreurCode !== null}
            desactive={verrouille || signer.isPending}
            aria-describedby={erreurCode ? idErreur : undefined}
          />
          {erreurCode ? (
            <div className="mt-2">
              <p id={idErreur} role="alert" className="text-ui text-destructive">
                {erreurCode}
              </p>
              {echecDeTransport ? (
                <Button type="button" variant="link" className="h-auto p-0 text-ui font-medium plancher-tactile-10" onClick={() => tenter(code, trace)} disabled={signer.isPending}>
                  {t('reessayer')}
                </Button>
              ) : null}
            </div>
          ) : !trace && code.length === LONGUEUR_DU_CODE ? (
            <p className="mt-2 text-ui text-muted-foreground">{t('signerAvantLeCode', { prenom })}</p>
          ) : signer.isPending ? (
            <p className="mt-2 text-ui text-muted-foreground" aria-live="polite">
              {t('verification')}
            </p>
          ) : null}
          <p className="mt-2.5 text-ui text-muted-foreground">
            {t('rienRecu')}{' '}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 align-baseline text-ui font-medium plancher-tactile-10"
              disabled={restant > 0 || envoyer.isPending || verrouille}
              onClick={() => void demanderLeCode()}
            >
              {t('renvoyer')}
            </Button>
            {restant > 0 ? <span className="tabular-nums"> {t('dans', { delai: delai(restant) })}</span> : null}
          </p>
          {erreurEnvoi ? (
            <p role="alert" className="mt-2 text-ui text-destructive">
              {erreurEnvoi}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="link"
            className="mt-3 h-11 w-full text-sm font-medium"
            disabled={envoyer.isPending || verrouille}
            onClick={() => void demanderLeCode()}
          >
            {envoyer.isPending ? t('envoiEnCours') : t('envoyerCode')}
          </Button>
          {erreurEnvoi ? (
            <p role="alert" className="mt-1 text-center text-ui text-destructive">
              {erreurEnvoi}
            </p>
          ) : null}
        </>
      )}
    </BlocDeSignature>
  );
}

export interface SignatureDeLAgenceProps {
  readonly inventory: Inventory;
  /** Qui signe (le lecteur) : « Sokhna Sène ». */
  readonly signataire: string;
  readonly avantDeSigner: () => Promise<string | null>;
}

/** Le bloc « Agence, pour le bailleur · {nom} » (ou « Bailleur · {nom} » quand le lecteur EST le bailleur). */
export function SignatureDeLAgence({ inventory, signataire, avantDeSigner }: SignatureDeLAgenceProps) {
  const t = useTranslations('inventory.terrain.signatures');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const signer = useSignInventory(inventory.id);
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const mandant = inventory.sign_on_behalf_of?.full_name ?? inventory.owner_signed_on_behalf_of?.full_name ?? null;
  const signePar = inventory.owner_signed_by?.full_name ?? null;
  const pourLeCompte = mandant !== null || inventory.owner_signed_on_behalf_of_user_id != null;
  const nom = inventory.owner_signed ? (signePar ?? signataire) : signataire;
  const titre = pourLeCompte ? t('agencePourLeBailleur', { nom }) : t('bailleur', { nom });

  const valider = async (trace: string) => {
    setErreur(null);
    const refus = await avantDeSigner();
    if (refus !== null) {
      setErreur(refus);
      return;
    }
    try {
      await signer.mutateAsync({ role: 'landlord', signature: trace });
    } catch (e) {
      setErreur(messageErreur(e, t('signatureImpossible')));
    }
  };

  if (inventory.owner_signed) {
    const heure = inventory.owner_signed_at ? f.heure(inventory.owner_signed_at) : null;
    return (
      <BlocDeSignature titre={titre} statut={<StatusBadge tone="success" label={t('statut.signe')} />}>
        {mandant ? <p className="mt-1 text-ui text-muted-foreground">{t('mandat', { nom: mandant })}</p> : null}
        {heure ? <p className="mt-1 text-ui text-muted-foreground">{t('signeA', { heure })}</p> : null}
      </BlocDeSignature>
    );
  }

  return (
    <BlocDeSignature titre={titre}>
      {mandant ? <p className="mt-1 text-ui text-muted-foreground">{t('mandat', { nom: mandant })}</p> : null}
      <BoutonSignerIci onClick={() => setOuvert(true)} desactive={signer.isPending} />
      <TracePleinEcran ouvert={ouvert} onOpenChange={setOuvert} titre={t('trace.titre', { nom: signataire })} onValider={(trace) => void valider(trace)} />
      {signer.isPending ? (
        <p className="mt-2 text-center text-ui text-muted-foreground" aria-live="polite">
          {t('enregistrement')}
        </p>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-2 text-center text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
    </BlocDeSignature>
  );
}

/** Le bailleur qui signera depuis son compte (le lecteur ne signe pas pour lui) : il est nommé, et on l'attend. */
export function SignatureDuBailleurAttendue({ inventory }: { readonly inventory: Inventory }) {
  const t = useTranslations('inventory.terrain.signatures');
  const nom = inventory.landlord?.full_name ?? '';
  return (
    <BlocDeSignature titre={nom ? t('bailleur', { nom }) : t('bailleurSansNom')} statut={<StatusBadge tone="neutral" label={t('statut.aSigner')} />}>
      <p className="mt-1 text-ui text-muted-foreground">{t('depuisSonCompte')}</p>
    </BlocDeSignature>
  );
}

function BlocDeSignature({ titre, statut, children }: { readonly titre: string; readonly statut?: ReactNode; readonly children?: ReactNode }) {
  return (
    <section data-slot="bloc-de-signature" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-corps font-semibold text-foreground">{titre}</h3>
        {statut}
      </div>
      {children}
    </section>
  );
}

/** « Une signature est définitive… » (maquette `MentionFigee`). */
export function MentionFigee({ className }: { readonly className?: string }) {
  const t = useTranslations('inventory.terrain.signatures');
  return (
    <p className={cn('flex gap-2.5 text-ui leading-relaxed text-muted-foreground', className)}>
      <Lock className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden />
      {t('mentionFigee')}
    </p>
  );
}
