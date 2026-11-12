'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Link2 } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { useLectureDImpaye } from './lecture';
import type { useRelanceDUnImpaye } from './useRelanceDUnImpaye';

type Relance = ReturnType<typeof useRelanceDUnImpaye>;

/**
 * TCK-2660 — le cœur de la relance, commun à la feuille du téléphone et au panneau du bureau : le
 * message prérempli (modifiable), le lien de paiement de l'échéance à copier, la dernière relance.
 * Aucun choix SMS / e-mail (décision 13 (a) : WhatsApp seul, depuis le téléphone de l'agence).
 */
export function ComposerLaRelance({ row, relance }: { readonly row: PaymentHistoryRow; readonly relance: Relance }) {
  const t = useTranslations('admin.finances.impayes.relancer');
  const tLecture = useTranslations('admin.finances.impayes');
  const f = useFormatteurs();
  const l = useLectureDImpaye();
  const [edition, setEdition] = useState(false);
  const idDuMessage = useId();
  const derniere = row.last_reminder;

  return (
    <div data-slot="composer-la-relance">
      <div className="flex items-center justify-between">
        <p id={idDuMessage} className="text-sm font-medium">
          {t('message')}
        </p>
        {relance.messagePret && !edition ? (
          <button
            type="button"
            onClick={() => setEdition(true)}
            className="inline-flex h-11 items-center rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring lg:h-8"
          >
            {t('modifier')}
          </button>
        ) : null}
      </div>
      {relance.etatDuLien === 'refuse' ? (
        <p role="alert" className="mt-2 rounded-xl bg-warning/10 px-3.5 py-3 text-sm text-foreground">
          {t('lienRefuse')}
        </p>
      ) : relance.etatDuLien === 'echec' ? (
        <div role="alert" className="mt-2 flex items-center gap-3 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{t('lienEchec')}</span>
          <Button type="button" variant="outline" size="sm" onClick={relance.relireLeLien}>
            {t('reessayer')}
          </Button>
        </div>
      ) : !relance.messagePret ? (
        <Skeleton className="mt-2 h-28 rounded-2xl" aria-hidden="true" data-testid="relance-message-chargement" />
      ) : edition ? (
        <Textarea
          aria-labelledby={idDuMessage}
          value={relance.message}
          onChange={(e) => relance.modifierLeMessage(e.target.value)}
          rows={6}
          className="mt-2 text-corps leading-relaxed"
        />
      ) : (
        <p
          data-slot="apercu-du-message"
          className="mt-2 whitespace-pre-line rounded-2xl rounded-tl-md bg-success/10 px-3.5 py-3 text-corps leading-relaxed text-foreground"
        >
          {relance.message}
        </p>
      )}

      {relance.etatDuLien === 'refuse' ? null : (
        <>
          <p className="mt-4 mb-1.5 text-sm font-medium">{t('lien')}</p>
          <LienDePaiement url={relance.url} />
        </>
      )}

      <p className="mt-4 text-ui leading-snug text-muted-foreground">
        {derniere
          ? derniere.source === 'automatic'
            ? t('derniereAutomatique', { date: f.jourMois(derniere.at) })
            : t('derniere', { date: f.jourMois(derniere.at), canal: l.canal(derniere) ?? '', nom: derniere.by?.name ?? tLecture('agence') })
          : t('jamais')}{' '}
        {t('seraNotee')}
      </p>
      {relance.noterEnEchec ? (
        <p role="alert" className="mt-2 text-ui text-destructive">
          {t('noteEchec')}
        </p>
      ) : null}
    </div>
  );
}

/** Le lien de paiement de l'échéance, à copier. */
export function LienDePaiement({ url }: { readonly url: string | null }) {
  const t = useTranslations('admin.finances.impayes.relancer');
  const [copie, setCopie] = useState(false);
  if (!url) return <Skeleton className="h-11 rounded-lg" aria-hidden="true" />;
  const affiche = url.replace(/^https?:\/\//, '');
  return (
    <div className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-card pr-1.5 pl-3 text-sm">
      <Link2 className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate tabular-nums" data-slot="lien-de-paiement">
        {affiche}
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopie(true), () => undefined);
        }}
        className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md bg-muted px-2.5 text-ui font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Copy className="size-3.5" aria-hidden="true" />
        <span aria-live="polite">{copie ? t('copie') : t('copier')}</span>
      </button>
    </div>
  );
}

/**
 * « Ouvrir WhatsApp » : un LIEN `wa.me` dès que le numéro, le lien de paiement et le message sont
 * là ; avant, un bouton désactivé qui dit pourquoi (`aria-describedby`). Le clic note la relance.
 */
export function OuvrirWhatsApp({
  relance,
  raisonId,
  onOuvert,
  className,
}: {
  readonly relance: Relance;
  /** L'identifiant de la phrase qui dit pourquoi le bouton est désactivé, si elle est rendue ailleurs. */
  readonly raisonId?: string;
  readonly onOuvert?: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('admin.finances.impayes.gestes');
  const classes = cn(
    buttonVariants({ size: 'xl' }),
    'gap-2 border-transparent bg-success font-semibold text-success-foreground hover:bg-success/90',
    className,
  );
  if (!relance.hrefWhatsApp) {
    return (
      <Button type="button" size="xl" disabled aria-describedby={raisonId} className={cn(classes)}>
        <IconeWhatsApp className="size-5" />
        {t('ouvrirWhatsApp')}
      </Button>
    );
  }
  return (
    <a
      href={relance.hrefWhatsApp}
      target="_blank"
      rel="noopener noreferrer"
      data-slot="ouvrir-whatsapp"
      onClick={() => {
        relance.noterLaRelance('whatsapp');
        onOuvert?.();
      }}
      className={classes}
    >
      <IconeWhatsApp className="size-5" />
      {t('ouvrirWhatsApp')}
    </a>
  );
}
