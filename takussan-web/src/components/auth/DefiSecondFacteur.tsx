'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormGlobalError } from '@/components/forms';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export type PreuveSecondFacteur = { two_factor_code: string } | { recovery_code: string };

interface DefiSecondFacteurProps {
  /** Soumet la preuve ; une erreur levée s'affiche sous le titre, et la saisie reste ouverte. */
  readonly onValider: (preuve: PreuveSecondFacteur) => Promise<void>;
  readonly onAnnuler: () => void;
}

/**
 * TCK-589, vérification adverse B2 — la saisie du second facteur d'un compte qui entre par un
 * fournisseur OAuth. Le rappel ne rend plus de jeton à un compte à 2FA, mais un défi : cette
 * saisie le solde. Mêmes libellés et même geste que le défi de `/auth/login`
 * (`auth.twoFactorChallenge`), code à 6 chiffres ou code de récupération.
 */
export function DefiSecondFacteur({ onValider, onAnnuler }: DefiSecondFacteurProps) {
  const t2fa = useTranslations('auth.twoFactorChallenge');
  const messageErreur = useMessageErreurApi();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(event: React.FormEvent) {
    event.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await onValider(useRecovery ? { recovery_code: code } : { two_factor_code: code });
    } catch (err) {
      setErreur(messageErreur(err, t2fa('invalidCode')));
      setCode('');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
        {t2fa('title')}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">
        {useRecovery ? t2fa('recoveryIntro') : t2fa('appIntro')}
      </p>

      {erreur ? <FormGlobalError>{erreur}</FormGlobalError> : null}

      <form onSubmit={soumettre} className="space-y-5">
        <div>
          <label htmlFor="oauth-two-factor-code" className="mb-1.5 block text-sm font-medium">
            {useRecovery ? t2fa('recoveryLabel') : t2fa('codeLabel')}
          </label>
          <Input
            id="oauth-two-factor-code"
            value={code}
            onChange={(e) =>
              setCode(
                useRecovery
                  ? e.target.value.toUpperCase().slice(0, 11)
                  : e.target.value.replace(/\D/g, '').slice(0, 6),
              )
            }
            inputMode={useRecovery ? 'text' : 'numeric'}
            pattern={useRecovery ? undefined : '\\d{6}'}
            autoComplete="one-time-code"
            placeholder={useRecovery ? t2fa('recoveryPlaceholder') : t2fa('codePlaceholder')}
            className="h-11 tabular-nums tracking-widest"
            required
          />
        </div>

        <Button
          type="submit"
          disabled={enCours || code.length < (useRecovery ? 11 : 6)}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {enCours ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t2fa('verifying')}
            </>
          ) : (
            t2fa('verify')
          )}
        </Button>
      </form>

      <div className="mt-4 flex items-center justify-between gap-2 text-sm">
        <button
          type="button"
          className="-ml-2 min-h-11 rounded-lg px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => {
            setUseRecovery((v) => !v);
            setCode('');
            setErreur(null);
          }}
        >
          {useRecovery ? t2fa('useApp') : t2fa('useRecovery')}
        </button>
        <button
          type="button"
          className="-mr-2 min-h-11 rounded-lg px-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={onAnnuler}
        >
          {t2fa('cancel')}
        </button>
      </div>
    </div>
  );
}
