'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, Download, Link2Off, Loader2, SearchX, Wallet } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  downloadPayLinkReceipt,
  fetchPayLink,
  initiatePayLink,
  verifyPayLink,
  type PayLink,
  type PayLinkProvider,
} from '@/lib/queries/pay-link';

type Etat =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly link: PayLink }
  | { readonly kind: 'gone'; readonly agency: string | null }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error' };

/** Le retour du fournisseur, tel que le serveur l'a écrit dans l'URL de retour. */
export type RetourFournisseur = 'success' | 'cancelled' | null;

function etatDeLErreur(err: unknown): Etat | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 410) {
    const params = (err.data as { params?: { agency?: unknown } } | null)?.params;
    return { kind: 'gone', agency: typeof params?.agency === 'string' && params.agency !== '' ? params.agency : null };
  }
  if (err.status === 404) return { kind: 'notFound' };
  // Un jeton que `cheminApi` refuse (`/`, `?`, `#`, `..`) ne désigne aucun lien : aucun appel n'est
  // parti, et la page dit la même chose qu'à un jeton inconnu.
  if (err.status === 400 && (err.data as { code?: unknown } | null)?.code === 'invalid_path') return { kind: 'notFound' };
  return null;
}

interface PayLinkReceptionProps {
  readonly token: string;
  readonly retour?: RetourFournisseur;
}

/**
 * TCK-602 (ADR-0051 §1) — la page `/pay/{jeton}` : un locataire SANS COMPTE règle son échéance.
 *
 * ⚠ Les montants s'affichent TELS QUE L'API LES REND (AC35). `amount_due` est déjà le montant que
 * le fournisseur encaissera : il inclut la pénalité quand l'agence l'encaisse en ligne, et ne
 * l'inclut pas sinon. Additionner `late_fee_outstanding` ici ferait afficher 165 000 pour un
 * paiement de 157 500 — la page ne calcule donc rien, elle DÉCOMPOSE au plus.
 */
export function PayLinkReception({ token, retour = null }: PayLinkReceptionProps) {
  const t = useTranslations('payLink');
  const locale = useLocale() as Locale;
  const [etat, setEtat] = useState<Etat>({ kind: 'loading' });
  const [tentative, setTentative] = useState(0);
  const [envoi, setEnvoi] = useState<PayLinkProvider | null>(null);
  const [erreurPaiement, setErreurPaiement] = useState(false);
  const [telechargement, setTelechargement] = useState(false);
  const [erreurTelechargement, setErreurTelechargement] = useState(false);

  useEffect(() => {
    let annule = false;
    // Au retour du fournisseur, l'état se relit chez lui d'abord : le webhook a pu se perdre.
    const verification = retour === 'success' ? verifyPayLink(token).catch(() => null) : Promise.resolve(null);
    verification
      .then(() => fetchPayLink(token))
      .then((link) => {
        if (!annule) setEtat({ kind: 'ready', link });
      })
      .catch((err: unknown) => {
        if (!annule) setEtat(etatDeLErreur(err) ?? { kind: 'error' });
      });
    return () => {
      annule = true;
    };
  }, [token, retour, tentative]);

  const payer = useCallback(
    async (provider: PayLinkProvider) => {
      setEnvoi(provider);
      setErreurPaiement(false);
      try {
        const { checkout_url } = await initiatePayLink(token, provider);
        window.location.assign(checkout_url);
      } catch (err) {
        const nomme = etatDeLErreur(err);
        if (nomme) setEtat(nomme);
        else setErreurPaiement(true);
        setEnvoi(null);
      }
    },
    [token],
  );

  const telecharger = useCallback(
    async (link: PayLink) => {
      setTelechargement(true);
      setErreurTelechargement(false);
      try {
        const fichier = await downloadPayLinkReceipt(token);
        const url = URL.createObjectURL(fichier);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = `${t('receiptFile')}-${link.reference ?? ''}.pdf`;
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        const nomme = etatDeLErreur(err);
        if (nomme) setEtat(nomme);
        else setErreurTelechargement(true);
      } finally {
        setTelechargement(false);
      }
    },
    [token, t],
  );

  if (etat.kind === 'loading') {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm bg-background text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t('loading')}
      </p>
    );
  }

  if (etat.kind === 'gone') {
    return (
      <EmptyState
        data-testid="pay-gone"
        icon={<Link2Off className="size-8" aria-hidden="true" />}
        title={t('goneTitle')}
        description={etat.agency ? t('goneDescriptionAgency', { agency: etat.agency }) : t('goneDescription')}
      />
    );
  }

  if (etat.kind === 'notFound') {
    return (
      <EmptyState
        data-testid="pay-not-found"
        icon={<SearchX className="size-8" aria-hidden="true" />}
        title={t('notFoundTitle')}
        description={t('notFoundDescription')}
      />
    );
  }

  if (etat.kind === 'error') {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => {
          setEtat({ kind: 'loading' });
          setTentative((n) => n + 1);
        }}
        retryLabel={t('retry')}
      />
    );
  }

  const { link } = etat;
  const devise = link.currency ?? 'XOF';
  const montant = (valeur: number) => formatCurrency(valeur, locale, { currency: devise });
  const agence = link.agency.name ?? '';
  const paye = link.status === 'paid';
  // La pénalité est DANS `amount_due` seulement quand l'agence l'encaisse en ligne ET qu'il reste
  // quelque chose à payer ; sinon elle se règle à l'agence, à part.
  const penaliteIncluse = link.late_fee_payable_online && link.amount_due > 0 && link.late_fee_outstanding > 0;
  const penaliteAPart = !penaliteIncluse && link.late_fee_outstanding > 0;

  return (
    <div className="mx-auto max-w-md space-y-5 rounded-xl border border-border bg-card p-6" data-testid="pay-link">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-muted p-3 text-accent">
          <Wallet className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="bg-card text-xs uppercase tracking-wide text-muted-foreground">{agence}</p>
          <h2 className="font-display text-base font-semibold break-words text-foreground">
            {link.property.title}
          </h2>
          {link.property.neighborhood ? (
            <p className="bg-card text-sm text-muted-foreground">{link.property.neighborhood}</p>
          ) : null}
        </div>
      </div>

      {retour === 'cancelled' && !paye ? (
        <p className="rounded-md bg-muted p-3 text-sm text-foreground" role="status">
          {t('cancelledNotice')}
        </p>
      ) : null}

      <dl className="grid grid-cols-1 gap-2 text-sm">
        {link.due_date ? (
          <div className="flex justify-between gap-4">
            <dt className="bg-card text-muted-foreground">{t('dueDate')}</dt>
            <dd className="text-foreground">{formatDate(link.due_date, locale)}</dd>
          </div>
        ) : null}
        {link.reference ? (
          <div className="flex justify-between gap-4">
            <dt className="bg-card text-muted-foreground">{t('reference')}</dt>
            <dd className="text-foreground">{link.reference}</dd>
          </div>
        ) : null}
        {!paye ? (
          <div className="flex justify-between gap-4">
            <dt className="bg-card font-medium text-foreground">{t('amountDue')}</dt>
            <dd className="font-display text-lg font-semibold tabular-nums text-foreground" data-testid="pay-amount">
              {montant(link.amount_due)}
            </dd>
          </div>
        ) : null}
        {penaliteIncluse ? (
          <div className="space-y-1 rounded-md bg-muted p-3" data-testid="pay-breakdown">
            <div className="flex justify-between gap-4">
              <dt className="bg-muted text-muted-foreground">{t('rent')}</dt>
              <dd className="tabular-nums text-foreground">{montant(link.amount_due - link.late_fee_outstanding)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="bg-muted text-muted-foreground">{t('lateFee')}</dt>
              <dd className="tabular-nums text-foreground">{montant(link.late_fee_outstanding)}</dd>
            </div>
          </div>
        ) : null}
        {penaliteAPart ? (
          <div className="space-y-1 rounded-md bg-muted p-3" data-testid="pay-late-fee-at-agency">
            <div className="flex justify-between gap-4">
              <dt className="bg-muted text-muted-foreground">{t('lateFee')}</dt>
              <dd className="tabular-nums text-foreground">{montant(link.late_fee_outstanding)}</dd>
            </div>
            <p className="bg-muted text-muted-foreground">{t('lateFeeAtAgency', { agency: agence })}</p>
          </div>
        ) : null}
      </dl>

      {paye ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground" role="status">
            <CheckCircle2 className="size-4 text-accent" aria-hidden="true" />
            {t('paid')}
          </p>
          {erreurTelechargement ? (
            <p className="text-sm text-destructive" role="alert">
              {t('receiptError')}
            </p>
          ) : null}
          {link.receipt_available ? (
            <Button className="w-full" onClick={() => void telecharger(link)} disabled={telechargement}>
              {telechargement ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              {t('receipt')}
            </Button>
          ) : null}
        </div>
      ) : link.providers.length > 0 ? (
        <div className="space-y-2">
          {erreurPaiement ? (
            <p className="text-sm text-destructive" role="alert">
              {t('payError')}
            </p>
          ) : null}
          {link.providers.map((provider) => (
            <Button
              key={provider}
              className="w-full"
              onClick={() => void payer(provider)}
              disabled={envoi !== null}
            >
              {envoi === provider ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t('payWith', { provider: t(`providers.${provider}`) })}
            </Button>
          ))}
        </div>
      ) : (
        <p className="bg-card text-sm text-muted-foreground" data-testid="pay-unavailable">
          {t('unavailable', { agency: agence })}
        </p>
      )}
    </div>
  );
}
