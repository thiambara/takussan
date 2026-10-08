'use client';

import React, { useEffect, useState } from 'react';
import { Check, Loader2, MailCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ApiError } from '@/lib/api';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import {
  confirmPublicSearchAlert,
  createPublicSearchAlert,
  fetchPublicAlertChannels,
  type PublicAlertChannel,
} from '@/lib/queries/public-search-alerts';

interface PublicSearchAlertFormProps {
  readonly criteria: Record<string, unknown>;
  readonly name: string;
  /** Le lien de connexion qui ramène sur la recherche — la voie « sauvegarder », avec un compte. */
  readonly loginHref: string;
  readonly onClose: () => void;
}

type Etape =
  | { readonly kind: 'form' }
  | { readonly kind: 'sentEmail' }
  | { readonly kind: 'code'; readonly phone: string }
  | { readonly kind: 'confirmed' };

/**
 * TCK-599 (V13, ADR-0050 §4) — « Me prévenir des nouveaux biens », pour un visiteur sans compte.
 *
 * Un seul champ de contact, une case de consentement explicite, puis un écran qui dit où chercher
 * la confirmation. Rien ne part avant elle. La réponse de l'API est la MÊME pour un contact connu
 * et inconnu (202) : l'écran suivant ne peut donc pas affirmer qu'un message est parti, seulement
 * qu'il est parti « si ce contact peut recevoir une alerte ».
 *
 * WhatsApp n'est proposé que si l'API le déclare (`capabilities`) ; il passe alors en tête sur
 * mobile, où le numéro se tape plus volontiers qu'une adresse. *
 * L'encre atténuée porte le fond de la boîte (`bg-popover`) : sans lui, la garde de contraste de
 * la surface publique la compte comme encre non mesurée (`surface-publique.contraste.test.ts`).
 */
export function PublicSearchAlertForm({ criteria, name, loginHref, onClose }: PublicSearchAlertFormProps) {
  const t = useTranslations('search.publicAlert');
  const locale = useLocale();
  const [channels, setChannels] = useState<PublicAlertChannel[]>(['email']);
  const [channel, setChannel] = useState<PublicAlertChannel>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [etape, setEtape] = useState<Etape>({ kind: 'form' });

  useEffect(() => {
    let annule = false;
    fetchPublicAlertChannels()
      .then((c) => {
        if (!annule && c.length > 0) setChannels(c);
      })
      .catch(() => {
        // L'e-mail reste proposé : c'est le canal que l'API sert toujours.
      });
    return () => {
      annule = true;
    };
  }, []);

  function messageDe(err: unknown, repli: string): string {
    if (err instanceof ApiError && err.status === 429) return t('tooMany');
    if (err instanceof ApiError && err.status === 422) return repli;
    return t('error');
  }

  async function envoyer(event: React.FormEvent) {
    event.preventDefault();
    const contact = channel === 'email' ? email.trim() : phone;
    if (contact === '') {
      setError(channel === 'email' ? t('emailRequired') : t('phoneRequired'));
      return;
    }
    if (!consent) {
      setError(t('consentRequired'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      await createPublicSearchAlert({
        criteria,
        name,
        frequency: 'daily',
        channel,
        ...(channel === 'email' ? { email: contact } : { phone: contact }),
        locale,
        consent: true,
      });
      setEtape(channel === 'email' ? { kind: 'sentEmail' } : { kind: 'code', phone: contact });
    } catch (err) {
      setError(messageDe(err, t('invalid')));
    } finally {
      setPending(false);
    }
  }

  async function confirmerCode(event: React.FormEvent) {
    event.preventDefault();
    if (etape.kind !== 'code') return;
    setError(null);
    setPending(true);
    try {
      await confirmPublicSearchAlert({ phone: etape.phone, code: code.trim() });
      setEtape({ kind: 'confirmed' });
    } catch (err) {
      setError(messageDe(err, t('invalidCode')));
    } finally {
      setPending(false);
    }
  }

  if (etape.kind === 'sentEmail' || etape.kind === 'confirmed') {
    const envoye = etape.kind === 'sentEmail';
    return (
      <div className="flex flex-col items-center py-4 text-center" role="status">
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-success/10">
          {envoye ? (
            <MailCheck className="size-5 text-success" aria-hidden="true" />
          ) : (
            <Check className="size-5 text-success" aria-hidden="true" />
          )}
        </div>
        <p className="mb-1 font-semibold text-foreground">{envoye ? t('sentEmailTitle') : t('confirmedTitle')}</p>
        <p className="mb-4 text-sm bg-popover text-muted-foreground">{envoye ? t('sentEmailBody') : t('confirmedBody')}</p>
        <Button variant="outline" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    );
  }

  if (etape.kind === 'code') {
    return (
      <form onSubmit={confirmerCode} className="space-y-4">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{t('codeTitle')}</p>
          <p className="text-sm bg-popover text-muted-foreground">{t('codeBody')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="public-alert-code">{t('codeLabel')}</Label>
          <Input
            id="public-alert-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            required
          />
        </div>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('confirm')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={envoyer} className="space-y-4" noValidate>
      {channels.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">{t('channelLegend')}</legend>
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => (
              <label
                key={c}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm ${
                  c === 'whatsapp' ? 'order-1 sm:order-2' : 'order-2 sm:order-1'
                } ${channel === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-popover text-foreground'}`}
              >
                <input
                  type="radio"
                  name="public-alert-channel"
                  value={c}
                  checked={channel === c}
                  onChange={() => {
                    setChannel(c);
                    setError(null);
                  }}
                  className="accent-primary"
                />
                {c === 'email' ? t('channelEmail') : t('channelWhatsapp')}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {channel === 'email' ? (
        <div className="space-y-2">
          <Label htmlFor="public-alert-email">{t('emailLabel')}</Label>
          <Input
            id="public-alert-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={255}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="public-alert-phone">{t('phoneLabel')}</Label>
          <PhoneInput id="public-alert-phone" value={phone} onValueChange={setPhone} autoComplete="tel" />
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          {t('consent')}{' '}
          <LienLocalise href={ROUTES_LEGALES.privacy} className="underline underline-offset-2">
            {t('privacyLink')}
          </LienLocalise>
        </span>
      </label>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? t('submitting') : t('submit')}
      </Button>

      <p className="text-center text-xs bg-popover text-muted-foreground">
        <LienLocalise href={loginHref} className="underline underline-offset-2 hover:text-foreground">
          {t('loginInstead')}
        </LienLocalise>
      </p>
    </form>
  );
}
