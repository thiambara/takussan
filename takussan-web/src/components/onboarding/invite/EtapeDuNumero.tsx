'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { BOUTON_D_ENTREE, BoutonCollant } from '@/components/auth/BoutonCollant';
import { CasesDuCode, LONGUEUR_DU_CODE } from '@/components/auth/CasesDuCode';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { phoneSendOtpAction, phoneVerifyOtpAction } from '@/app/actions/security';
import { formaterTelephone, numeroComposable } from '@/lib/phone';
import { cn } from '@/lib/utils';

import { TitreDInvite, numeroMasqueDInvite } from './pieces';

/**
 * TCK-2613 — l'étape commune des trois assistants d'invité (bailleur, agent, prestataire) : le numéro, le code.
 * Maquette `app-entree-assistants`, approche a, « Ton numéro, étape commune ».
 *
 * Elle remplace les trois copies de `PhoneStep` (identiques au caractère près) et garde ce qu'elles faisaient :
 * le numéro TAPÉ part avec la demande (TCK-566), le code d'aperçu hors production (TCK-620, ADR-0060), le code
 * vérifié quitte le brouillon (TCK-1362 : la page ne l'y écrit jamais — il vit ici, dans l'état du composant).
 *
 * ⚠ **Un échec d'envoi s'écrit SOUS LE CHAMP, et y reste** (AC2) : un toast disparaissait en quelques secondes,
 * et la personne ne savait plus pourquoi rien n'arrivait. Un 429 dit son délai, lu de `retry_after` — jamais une
 * durée supposée ; le compte à rebours du renvoi n'a pas d'autre source.
 */
interface EtapeDuNumeroProps {
  /** Le numéro, en E.164 (celui que l'agence a saisi, ou la saisie). */
  readonly numero: string;
  readonly onNumero: (numero: string) => void;
  /** Le nom de l'agence qui invite ; `null` s'il n'est pas connu. */
  readonly agence: string | null;
  /** Le code est accepté : la page note le numéro vérifié et passe à l'étape suivante. */
  readonly onVerifie: () => void;
}

const ID = 'invite-numero';

/** « 0:42 » — les secondes du renvoi. */
function delai(secondes: number): string {
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

export function EtapeDuNumero({ numero, onNumero, agence, onVerifie }: EtapeDuNumeroProps) {
  const t = useTranslations('onboarding.invite.numero');
  const decalage = useDecalageDuClavier();
  // Un numéro déjà saisi par l'agence se montre figé, avec « Modifier » ; sans numéro, le champ s'ouvre.
  const [modifiable, setModifiable] = useState(() => !numeroComposable(numero));
  const [envoye, setEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [code, setCode] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);
  const [attente, setAttente] = useState(0);
  const [erreurDEnvoi, setErreurDEnvoi] = useState<string | null>(null);
  const [erreurDuCode, setErreurDuCode] = useState<string | null>(null);
  const [verification, setVerification] = useState(false);
  // UNE vérification à la fois : le sixième chiffre et « Continuer » ne partent jamais deux fois.
  const enVol = useRef(false);

  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = window.setTimeout(() => setAttente((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(minuterie);
  }, [attente]);

  async function envoyer() {
    if (!numeroComposable(numero) || envoi) return;
    setEnvoi(true);
    setErreurDEnvoi(null);
    try {
      const res = await phoneSendOtpAction(numero);
      if (!res.ok) {
        // 429 : le délai de l'API, en minutes entières (« Réessayez dans 2 min ») ; sinon, ce que l'API a dit.
        if ('attente' in res) {
          setAttente(res.attente);
          setErreurDEnvoi(t('trop', { minutes: Math.max(1, Math.ceil(res.attente / 60)) }));
        } else {
          setErreurDEnvoi(res.message);
        }
        return;
      }
      setEnvoye(true);
      setModifiable(false);
      setCode('');
      setErreurDuCode(null);
      setApercu(res.data?.codeApercu ?? null);
      setAttente(res.data?.attente ?? 0);
    } finally {
      setEnvoi(false);
    }
  }

  async function verifier(saisi: string) {
    if (saisi.length !== LONGUEUR_DU_CODE || enVol.current) return;
    enVol.current = true;
    setVerification(true);
    setErreurDuCode(null);
    try {
      const res = await phoneVerifyOtpAction(saisi);
      if (!res.ok) {
        setErreurDuCode(res.message);
        return;
      }
      onVerifie();
    } finally {
      enVol.current = false;
      setVerification(false);
    }
  }

  function modifier() {
    setModifiable(true);
    setEnvoye(false);
    setCode('');
    setApercu(null);
    setErreurDuCode(null);
  }

  const idErreur = `${ID}-erreur`;
  const fort = (morceaux: ReactNode) => <span className="font-semibold tabular-nums">{morceaux}</span>;

  return (
    <div className="flex flex-col">
      <TitreDInvite>{t('titre')}</TitreDInvite>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground lg:mt-3 lg:text-base">
        {agence ? t('texte', { agence }) : t('texteSans')}
      </p>

      <div className="mt-6 lg:mt-8">
        {modifiable ? (
          <>
            <Label htmlFor={`${ID}-champ`} className="mb-1.5 leading-(--text-sm--line-height)">
              {t('libelle')}
            </Label>
            <PhoneInput
              id={`${ID}-champ`}
              value={numero}
              onValueChange={(valeur) => {
                setErreurDEnvoi(null);
                onNumero(valeur);
              }}
              autoComplete="tel-national"
              aide={false}
              aria-describedby={erreurDEnvoi ? idErreur : undefined}
              aria-invalid={erreurDEnvoi ? true : undefined}
            />
          </>
        ) : (
          <>
            <p id={`${ID}-libelle`} className="mb-1.5 text-sm font-medium">
              {t('libelle')}
            </p>
            <div
              className={cn(
                'flex h-11 items-center rounded-lg border bg-card text-[0.9375rem]',
                erreurDEnvoi ? 'border-destructive' : 'border-border',
              )}
            >
              <span className="flex h-full items-center border-r border-border px-3 text-muted-foreground tabular-nums">+221</span>
              <span aria-labelledby={`${ID}-libelle`} className="min-w-0 flex-1 truncate px-3 tabular-nums">
                {formaterTelephone(numero).replace(/^\+221 /, '')}
              </span>
              <button
                type="button"
                onClick={modifier}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {t('modifier')}
              </button>
            </div>
          </>
        )}
        {erreurDEnvoi ? (
          <p id={idErreur} role="alert" data-erreur-d-envoi="" className="mt-1.5 text-[0.8125rem] text-destructive">
            {erreurDEnvoi}
          </p>
        ) : null}
      </div>

      {envoye ? (
        <>
          <p className="mt-6 text-sm lg:mt-7">{t.rich('envoye', { numero: numeroMasqueDInvite(numero), fort })}</p>
          <label htmlFor={`${ID}-code`} className="sr-only">
            {t('codeLibelle')}
          </label>
          <CasesDuCode
            id={`${ID}-code`}
            valeur={code}
            erreur={erreurDuCode !== null}
            figee={verification}
            aria-describedby={erreurDuCode ? `${ID}-code-erreur` : undefined}
            onChange={(valeur) => {
              setErreurDuCode(null);
              setCode(valeur);
            }}
            className="mt-3"
          />
          {erreurDuCode ? (
            <p id={`${ID}-code-erreur`} role="alert" className="mt-2 text-[0.8125rem] text-destructive">
              {erreurDuCode}
            </p>
          ) : null}
          {attente > 0 ? (
            <p className="mt-3 text-[0.8125rem] text-muted-foreground">
              {t.rich('renvoiDans', { delai: delai(attente), chiffres: (m) => <span className="tabular-nums">{m}</span> })}
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
              {t('rienRecu')}
              <button
                type="button"
                onClick={() => void envoyer()}
                disabled={envoi}
                className="inline-flex min-h-11 items-center rounded-lg font-medium text-primary underline decoration-1 underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
              >
                {t('renvoyer')}
              </button>
            </p>
          )}
          <CodeDePreproduction code={apercu} onUtiliser={setCode} className="mt-5 lg:mt-6" />
        </>
      ) : null}

      <BoutonCollant decalage={decalage} className="lg:mt-7">
        {envoye ? (
          <>
            <Button
              type="button"
              onClick={() => void verifier(code)}
              disabled={code.length !== LONGUEUR_DU_CODE || verification}
              className={BOUTON_D_ENTREE}
            >
              {verification ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t('verification')}
                </>
              ) : (
                t('continuer')
              )}
            </Button>
            <p className="pt-1 text-center text-xs text-muted-foreground lg:hidden">{t('aideContinuer')}</p>
          </>
        ) : (
          <Button
            type="button"
            onClick={() => void envoyer()}
            disabled={!numeroComposable(numero) || envoi || attente > 0}
            className={BOUTON_D_ENTREE}
          >
            {envoi ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t('envoi')}
              </>
            ) : (
              t('recevoir')
            )}
          </Button>
        )}
      </BoutonCollant>
    </div>
  );
}
