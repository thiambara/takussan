'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { FormGlobalError } from '@/components/forms';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useAuth } from '@/context/AuthContext';
import { useCurrentLocale } from '@/i18n/hooks';
import { ApiError } from '@/lib/api';
import {
  demanderCodeTelephone,
  exigeDoubleFacteur,
  verifierCodeTelephone,
} from '@/lib/connexion-telephone';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { formaterTelephone, numeroComposable } from '@/lib/phone';

/**
 * TCK-589 — connexion et inscription par numéro de téléphone (ADR-0033), en trois temps :
 * le numéro, le code reçu par SMS, et — si le compte en a un — le second facteur.
 *
 * ⚠ **Le texte ne dit jamais si un compte existe** : l'API répond pareil, l'écran aussi. « Si ce
 * numéro peut recevoir des SMS, un code vient d'y être envoyé » — et c'est la vérification du code
 * qui ouvre la session, ou crée le compte (`is_new_account`).
 */
interface ConnexionParTelephoneProps {
  readonly variante: 'login' | 'register';
  /** Session ouverte ; `true` quand le compte vient d'être créé par ce code. */
  readonly onConnecte: (nouveauCompte: boolean) => void;
  /** Le lien secondaire « e-mail et mot de passe ». */
  readonly onEmail: () => void;
}

type Etape = 'numero' | 'code' | 'double-facteur';

const CLASSE_LIEN_SECONDAIRE =
  'min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:text-muted-foreground disabled:no-underline';

export function ConnexionParTelephone({ variante, onConnecte, onEmail }: ConnexionParTelephoneProps) {
  const t = useTranslations('auth.phoneLogin');
  const t2fa = useTranslations('auth.twoFactorChallenge');
  const locale = useCurrentLocale();
  const { openSession } = useAuth();

  const [etape, setEtape] = useState<Etape>('numero');
  const [telephone, setTelephone] = useState('');
  const [code, setCode] = useState('');
  const [secondFacteur, setSecondFacteur] = useState('');
  const [codeDeSecours, setCodeDeSecours] = useState(false);
  const [attente, setAttente] = useState(0);
  const [apercu, setApercu] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Compte à rebours du renvoi : `retry_after` est la seule source, jamais une durée supposée.
  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = window.setTimeout(() => setAttente((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(minuterie);
  }, [attente]);

  function messageDemande(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 429) return t('tooMany');
      if (err.status === 422) return t('invalidPhone');
    }
    return t('failed');
  }

  function messageVerification(err: unknown): string {
    if (err instanceof ApiError) {
      const codeErreur =
        err.data && typeof err.data === 'object' ? (err.data as { code?: unknown }).code : undefined;
      if (err.status === 423 || codeErreur === 'account_locked') return t('locked');
      if (codeErreur === 'account_blocked') return t('blocked');
      if (err.status === 429) return t('tooMany');
      if (err.status === 422) return t('codeInvalid');
    }
    return t('failed');
  }

  async function envoyerCode(): Promise<void> {
    setEnvoi(true);
    setErreur(null);
    try {
      const demande = await demanderCodeTelephone(telephone, locale);
      setAttente(demande.attente);
      setApercu(demande.codeApercu);
      setCode('');
      setEtape('code');
    } catch (err) {
      // Drapeau éteint entre l'affichage et l'envoi : la voie e-mail reste la seule.
      if (err instanceof ApiError && err.status === 404) {
        onEmail();
        return;
      }
      setErreur(messageDemande(err));
    } finally {
      setEnvoi(false);
    }
  }

  async function verifier(avecSecondFacteur: boolean): Promise<void> {
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await verifierCodeTelephone(
        {
          phone: telephone,
          code,
          ...(avecSecondFacteur
            ? codeDeSecours
              ? { recovery_code: secondFacteur }
              : { two_factor_code: secondFacteur }
            : {}),
        },
        locale,
      );
      if (exigeDoubleFacteur(reponse)) {
        if (avecSecondFacteur) setErreur(t2fa('invalidCode'));
        setEtape('double-facteur');
        return;
      }
      await openSession(reponse.token, reponse.user, reponse.expires_at);
      onConnecte(reponse.is_new_account === true);
    } catch (err) {
      setErreur(messageVerification(err));
    } finally {
      setEnvoi(false);
    }
  }

  const titre = variante === 'register' ? t('registerTitle') : t('loginTitle');
  const sousTitre = variante === 'register' ? t('registerSubtitle') : t('loginSubtitle');

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
        {etape === 'double-facteur' ? t2fa('title') : titre}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">
        {etape === 'double-facteur'
          ? codeDeSecours
            ? t2fa('recoveryIntro')
            : t2fa('appIntro')
          : etape === 'code'
            ? t('codeSentTo', { phone: formaterTelephone(telephone) })
            : sousTitre}
      </p>

      {erreur ? <FormGlobalError>{erreur}</FormGlobalError> : null}

      {etape === 'numero' ? (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void envoyerCode();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="connexion-telephone" className="block text-sm font-medium">
              {t('phoneLabel')}
            </label>
            <PhoneInput
              id="connexion-telephone"
              value={telephone}
              onValueChange={setTelephone}
              autoComplete="tel-national"
              className="h-11"
              required
            />
          </div>
          {/* TCK-624 — sur les DEUX variantes : la connexion par téléphone ouvre un compte au
              premier code d'un numéro inconnu. Le compte naissait sans que la mention des
              conditions ait été montrée. */}
          <p className="text-xs text-muted-foreground text-pretty">
            {t.rich('termsNotice', {
              terms: (chunks) => (
                <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
                  {chunks}
                </LienLocalise>
              ),
              privacy: (chunks) => (
                <LienLocalise href={ROUTES_LEGALES.privacy} target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
                  {chunks}
                </LienLocalise>
              ),
            })}
          </p>
          <Button
            type="submit"
            disabled={envoi || !numeroComposable(telephone)}
            className="w-full rounded-full h-11 text-base font-semibold"
          >
            {envoi ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('sending')}
              </>
            ) : (
              t('sendCode')
            )}
          </Button>
        </form>
      ) : null}

      {etape === 'code' ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void verifier(false);
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="connexion-code" className="block text-sm font-medium">
              {t('codeLabel')}
            </label>
            <Input
              id="connexion-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              className="h-11 tabular-nums tracking-widest"
              required
              autoFocus
            />
          </div>
          <CodeDePreproduction code={apercu} onUtiliser={setCode} />
          <Button
            type="submit"
            disabled={envoi || code.length !== 6}
            className="w-full rounded-full h-11 text-base font-semibold"
          >
            {envoi ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('verifying')}
              </>
            ) : (
              t('verify')
            )}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className={`-ml-2 ${CLASSE_LIEN_SECONDAIRE}`}
              disabled={envoi || attente > 0}
              onClick={() => void envoyerCode()}
            >
              {attente > 0 ? t('resendIn', { seconds: attente }) : t('resend')}
            </button>
            <button
              type="button"
              className={`-mr-2 ${CLASSE_LIEN_SECONDAIRE} text-muted-foreground`}
              onClick={() => {
                setEtape('numero');
                setCode('');
                setErreur(null);
              }}
            >
              {t('changeNumber')}
            </button>
          </div>
        </form>
      ) : null}

      {etape === 'double-facteur' ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void verifier(true);
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="connexion-second-facteur" className="block text-sm font-medium">
              {codeDeSecours ? t2fa('recoveryLabel') : t2fa('codeLabel')}
            </label>
            <Input
              id="connexion-second-facteur"
              value={secondFacteur}
              onChange={(e) =>
                setSecondFacteur(
                  codeDeSecours
                    ? e.target.value.toUpperCase().slice(0, 11)
                    : e.target.value.replace(/\D/g, '').slice(0, 6),
                )
              }
              inputMode={codeDeSecours ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              placeholder={codeDeSecours ? t2fa('recoveryPlaceholder') : t2fa('codePlaceholder')}
              className="h-11 tabular-nums tracking-widest"
              required
              autoFocus
            />
          </div>
          <Button
            type="submit"
            disabled={envoi || secondFacteur.length < (codeDeSecours ? 11 : 6)}
            className="w-full rounded-full h-11 text-base font-semibold"
          >
            {envoi ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t2fa('verifying')}
              </>
            ) : (
              t2fa('verify')
            )}
          </Button>
          <button
            type="button"
            className={`-ml-2 ${CLASSE_LIEN_SECONDAIRE}`}
            onClick={() => {
              setCodeDeSecours((v) => !v);
              setSecondFacteur('');
              setErreur(null);
            }}
          >
            {codeDeSecours ? t2fa('useApp') : t2fa('useRecovery')}
          </button>
        </form>
      ) : null}

      <p className="mt-6 text-center">
        <button type="button" className={CLASSE_LIEN_SECONDAIRE} onClick={onEmail}>
          {t('useEmail')}
        </button>
      </p>
    </div>
  );
}
