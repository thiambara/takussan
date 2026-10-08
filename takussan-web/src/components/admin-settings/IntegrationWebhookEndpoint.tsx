'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/forms';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { avecGardeDoubleFacteurAction } from '@/lib/double-facteur';
import type { PaymentProviderId } from '@/lib/schemas/setting';
import {
  fetchIntegrationWebhookEndpointAction,
  rotateIntegrationWebhookEndpointAction,
} from '@/app/actions/admin-settings';

/**
 * TCK-293 (ADR-0046) — l'adresse de notification d'une intégration de paiement.
 *
 * Chaque intégration a la sienne : le jeton qu'elle porte désigne l'intégration dont le secret
 * vérifie la signature, et le rapprochement ne sort pas de son agence. Wave et Lemon Squeezy
 * l'attendent collée dans leur portail ; Orange Money la reçoit à chaque paiement.
 *
 * L'adresse arrive préchargée par la page ; sinon (intégration créée à l'instant, lecture en
 * échec), un bouton la lit. Régénérer est un geste protégé : le refus de second facteur passe par
 * la garde des consoles, puis le geste est rejoué.
 */

interface IntegrationWebhookEndpointProps {
  readonly integrationId: number;
  readonly provider: PaymentProviderId;
  readonly initialUrl?: string | null;
}

const HINT_KEYS = {
  wave: 'hintWave',
  orange_money: 'hintOrangeMoney',
  lemon_squeezy: 'hintLemonSqueezy',
} as const satisfies Record<PaymentProviderId, string>;

export function IntegrationWebhookEndpoint({
  integrationId,
  provider,
  initialUrl = null,
}: IntegrationWebhookEndpointProps) {
  const t = useTranslations('adminSettings.integrations.webhookEndpoint');
  const garde = useGardeDoubleFacteur();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const label = t(`providers.${provider}`);
  const inputId = `int-webhook-endpoint-${integrationId}`;

  const handleLoad = () => {
    setError(null);
    startTransition(async () => {
      const result = await fetchIntegrationWebhookEndpointAction(integrationId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUrl(result.data?.url ?? null);
    });
  };

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(null);
    } catch {
      // Contexte non sécurisé ou permission refusée : on sélectionne, la copie se fait à la main.
      inputRef.current?.select();
      setError(t('copyFailed'));
    }
  };

  const handleRotate = () => {
    if (!window.confirm(t('confirmRotate', { provider: label }))) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await avecGardeDoubleFacteurAction(
        () => rotateIntegrationWebhookEndpointAction(integrationId),
        garde,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUrl(result.data?.url ?? null);
      setCopied(false);
      setNotice(t('rotated'));
    });
  };

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="space-y-2 rounded-lg border border-border bg-muted/40 p-3"
    >
      <div>
        <h4 id={`${inputId}-title`} className="text-xs font-semibold text-foreground">
          {t('title')}
        </h4>
        <p className="text-xs text-pretty text-muted-foreground">{t(HINT_KEYS[provider])}</p>
      </div>

      {url ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">
            {t('label', { provider: label })}
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              <span>{copied ? t('copied') : t('copy')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleRotate}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              <span>{t('rotate')}</span>
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={handleLoad} disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          <span>{t('show')}</span>
        </Button>
      )}

      {notice ? (
        <p role="status" className="text-xs text-success">
          {notice}
        </p>
      ) : null}
      {error ? <FormError>{error}</FormError> : null}
    </section>
  );
}
