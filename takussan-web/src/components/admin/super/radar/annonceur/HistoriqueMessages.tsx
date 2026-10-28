'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { RadarOutreach } from '@/types/radar';

interface HistoriqueMessagesProps {
  /** Du plus récent au plus ancien, tels que l'API les rend. */
  readonly messages: readonly RadarOutreach[];
}

/**
 * TCK-2388 — les messages déjà envoyés à l'annonceur : date, auteur, langue, version des clauses, annonces
 * couvertes, statut et issue ; le texte exact, enregistré à l'envoi, se replie. Un message encore préparé
 * n'est pas ici : il a son aperçu.
 */
export function HistoriqueMessages({ messages }: HistoriqueMessagesProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.history');
  const fmt = useFormatteurs();

  return (
    <section aria-label={t('heading')} className="space-y-3" data-testid="radar-annonceur-historique">
      <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="space-y-3">
          {messages.map((message) => (
            <li key={message.id} className="space-y-2 rounded-xl border bg-card p-4" data-testid="radar-annonceur-historique-ligne">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={message.status === 'closed' ? 'success' : 'info'}
                  label={t(`statuses.${message.status}`)}
                />
                <span className="text-sm font-medium text-foreground">
                  {message.outcome === null ? t('noOutcome') : t(`outcomes.${message.outcome}`)}
                </span>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
                <dt className="text-muted-foreground">{t('date')}</dt>
                <dd className="text-foreground">
                  {message.sent_at === null ? fmt.dateTime(message.created_at) : t('sentAt', { date: fmt.dateTime(message.sent_at) })}
                </dd>
                <dt className="text-muted-foreground">{t('author')}</dt>
                <dd className="text-foreground">{message.created_by?.name ?? t('unknownAuthor')}</dd>
                <dt className="text-muted-foreground">{t('locale')}</dt>
                <dd className="text-foreground uppercase">{message.locale}</dd>
                <dt className="text-muted-foreground">{t('clauses')}</dt>
                <dd className="text-foreground">{message.clauses_version}</dd>
                <dt className="text-muted-foreground">{t('listings')}</dt>
                <dd className="flex flex-wrap gap-x-2 text-foreground">
                  {message.listing_ids.map((id) => (
                    <Link
                      key={id}
                      href={`/super-admin/radar/${id}`}
                      className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('number', { id })}
                    </Link>
                  ))}
                </dd>
              </dl>
              <details className="text-sm">
                <summary className="cursor-pointer rounded-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {t('text')}
                </summary>
                <pre className="mt-2 rounded-md bg-muted p-3 font-sans text-sm whitespace-pre-wrap text-foreground">{message.message}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
