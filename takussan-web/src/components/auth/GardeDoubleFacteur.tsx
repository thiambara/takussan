'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';

import { TotpEnrollment } from '@/components/auth/TotpEnrollment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { ApiError, apiRequest } from '@/lib/api';
import type { CodeDoubleFacteur, GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { ContexteGardeDoubleFacteur } from './garde-double-facteur-contexte';

/**
 * TCK-589 — résout sur place les refus `two_factor_required` et `two_factor_step_up_required`.
 *
 * Monté par les layouts des consoles. `useApiMutation` (et tout appelant passé par
 * `avecGardeDoubleFacteur`) lui confie le refus ; la garde ouvre la bonne boîte, et la promesse
 * dit à l'appelant s'il peut rejouer. Fermer la boîte, c'est refuser : l'erreur d'origine remonte.
 *
 * Le ton explique pourquoi on demande, pas seulement quoi : un refus sec au milieu d'une action
 * ressemblait à une panne.
 */

interface Demande {
  readonly code: CodeDoubleFacteur;
  readonly resoudre: (rejouer: boolean) => void;
}

interface GardeDoubleFacteurProps {
  readonly children: ReactNode;
}

export function GardeDoubleFacteur({ children }: GardeDoubleFacteurProps) {
  const t = useTranslations('auth.twoFactorGate');
  const { refreshUser } = useAuth();
  const [demande, setDemande] = useState<Demande | null>(null);

  const exiger: GardeDoubleFacteurFn = (code) =>
    new Promise<boolean>((resoudre) => {
      // Une seule boîte à la fois : la demande précédente, abandonnée, se solde par un refus.
      demande?.resoudre(false);
      setDemande({ code, resoudre });
    });

  function terminer(rejouer: boolean): void {
    demande?.resoudre(rejouer);
    setDemande(null);
  }

  const enrolement = demande?.code === 'two_factor_required';

  return (
    <ContexteGardeDoubleFacteur.Provider value={exiger}>
      {children}
      <Dialog
        open={demande !== null}
        onOpenChange={(ouvert) => {
          if (!ouvert) terminer(false);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{enrolement ? t('requiredTitle') : t('stepUpTitle')}</DialogTitle>
            <DialogDescription className="text-pretty">
              {enrolement ? t('requiredBody') : t('stepUpBody')}
            </DialogDescription>
          </DialogHeader>
          {enrolement ? (
            <TotpEnrollment
              mode="forced"
              onComplete={() => {
                void refreshUser();
                terminer(true);
              }}
            />
          ) : demande ? (
            <PreuveRecente onValide={() => terminer(true)} onAnnuler={() => terminer(false)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </ContexteGardeDoubleFacteur.Provider>
  );
}

interface PreuveRecenteProps {
  readonly onValide: () => void;
  readonly onAnnuler: () => void;
}

function PreuveRecente({ onValide, onAnnuler }: PreuveRecenteProps) {
  const t = useTranslations('auth.twoFactorGate');
  const { token, logout } = useAuth();
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await apiRequest('/api/auth/two-factor/step-up', {
        method: 'POST',
        body: { code: code.trim() },
        token: token ?? undefined,
      });
      onValide();
    } catch (err) {
      // Trop d'échecs : l'API a révoqué CE jeton (vérification adverse m2). La session est
      // morte, on la ferme ici plutôt que de laisser l'écran rejouer un jeton refusé.
      if (err instanceof ApiError && err.status === 401) {
        setErreur(t('sessionClosed'));
        void logout();
        return;
      }
      setErreur(err instanceof ApiError && err.status === 422 ? t('invalidCode') : t('failed'));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={valider} className="space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-foreground">{t('codeLabel')}</span>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className="h-11 text-center font-mono text-lg tracking-[0.4em]"
        />
      </label>
      {erreur ? (
        <p role="alert" className="text-sm text-destructive text-pretty">
          {erreur}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="h-11" onClick={onAnnuler} disabled={envoi}>
          {t('cancel')}
        </Button>
        <Button type="submit" className="h-11 gap-2" disabled={envoi || code.length !== 6}>
          {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
          {envoi ? t('confirming') : t('confirm')}
        </Button>
      </div>
    </form>
  );
}
