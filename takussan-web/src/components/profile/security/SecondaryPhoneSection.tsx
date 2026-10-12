'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import {
  secondaryPhoneRemoveAction,
  secondaryPhoneSendOtpAction,
  secondaryPhoneVerifyAction,
} from '@/app/actions/secondary-phone';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import { isE164 } from '@/lib/phone';

import { CaseWhatsApp } from './CaseWhatsApp';

type Retour = { ok: boolean; message: string };

/**
 * TCK-633 (lot C, AC8) — un second numéro, vérifié par code. Il ne sert JAMAIS à se connecter.
 * Visible une fois le numéro principal vérifié : le second vient après le premier.
 */
export function SecondaryPhoneSection() {
  const t = useTranslations('profile.contact.secondary');
  const tCommon = useTranslations('common.actions');
  const { user, setUser } = useAuth();
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState(false);
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [code, setCode] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!user?.phone_verified_at) return null;
  const enregistre = user.secondary_phone && user.secondary_phone_verified_at ? user.secondary_phone : null;

  const envoyer = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await secondaryPhoneSendOtpAction(phone);
      if (r.ok) {
        setCodeEnvoye(true);
        setApercu(r.codeApercu);
        setRetour({ ok: true, message: t('codeSent') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  const verifier = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await secondaryPhoneVerifyAction(phone, code, whatsapp);
      if (r.ok) {
        setUser(r.user);
        setPhone('');
        setCode('');
        setCodeEnvoye(false);
        setApercu(null);
        setRetour({ ok: true, message: t('verified') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  const retirer = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await secondaryPhoneRemoveAction();
      if (r.ok) {
        setUser(r.user);
        setRetour({ ok: true, message: t('removed') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid="secondary-phone-section">
      <p className="text-xs font-semibold text-muted-foreground">{t('title')}</p>
      {enregistre ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground tabular-nums" data-testid="secondary-phone-value">
              {enregistre}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={retirer} disabled={enCours} data-testid="secondary-phone-remove">
              {t('remove')}
            </Button>
          </div>
          <CaseWhatsApp champ="secondary_phone_whatsapp" id="secondary-phone-whatsapp" />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('hint')}</p>
          <PhoneInput
            id="secondary-phone"
            value={phone}
            onValueChange={setPhone}
            disabled={enCours}
            data-testid="secondary-phone-input"
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={whatsapp}
              onChange={(e) => setWhatsapp(e.target.checked)}
              className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
            />
            {t('whatsapp')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={envoyer}
              disabled={enCours || !isE164(phone)}
              data-testid="secondary-phone-send"
            >
              {codeEnvoye ? t('resend') : t('send')}
            </Button>
            {codeEnvoye ? (
              <>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                  aria-label={t('codeAria')}
                  data-testid="secondary-phone-code"
                  className="max-w-[8rem]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={verifier}
                  disabled={enCours || code.length !== 6}
                  data-testid="secondary-phone-verify"
                >
                  {tCommon('confirm')}
                </Button>
              </>
            ) : null}
          </div>
          <CodeDePreproduction code={codeEnvoye ? apercu : null} onUtiliser={setCode} />
        </>
      )}
      {retour ? (
        <p role={retour.ok ? 'status' : 'alert'} className={'text-xs ' + (retour.ok ? 'text-success' : 'text-destructive')}>
          {retour.message}
        </p>
      ) : null}
    </div>
  );
}
