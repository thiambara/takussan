'use client';

import Image from 'next/image';
import { Building2, CalendarCheck, Check, FileText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Logo, SymboleTakussan } from '@/components/brand/Logo';
import { BoutonFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';
import { formatMontant } from '@/lib/format/currency';
import type { BienQuitte } from '@/lib/queries/bien-quitte';
import { cn } from '@/lib/utils';

import type { ActionDEntree } from './lien-connexion';

/**
 * TCK-2604 — ce que le visiteur était en train de faire, dit par l'écran de connexion (maquette
 * `app-entree-connexion`, approche a) : la photo du bien quitté en tête du téléphone, sa barre sur
 * l'écran du code, et au bureau le panneau de gauche.
 *
 * L'action vient d'une liste FERMÉE (`ACTIONS_D_ENTREE`) ; le bien, de la lecture partagée de la
 * fiche (`bienQuitte`, côté serveur). Aucun texte de l'URL n'est affiché tel quel.
 */
export interface IntentionAffichee {
  readonly action: ActionDEntree;
  /** `null` : une action sans bien (une alerte, `/publish`) — la barre dit l'action, rien de plus. */
  readonly bien: BienQuitte | null;
  /** Les dates que porte la page à rouvrir (`debut`, `fin`), quand elle en porte. */
  readonly dates: { readonly debut: string; readonly fin: string | null } | null;
}

/** Le prix et sa période (« 250 000 F CFA / mois »), puis les dates du geste quand elles sont connues. */
function useDetailsDuBien(intention: IntentionAffichee): { readonly prix: string | null; readonly date: string | null } {
  const t = useTranslations('auth.porte');
  const format = useFormatter();
  const bien = intention.bien;
  const montant = bien?.prix != null ? formatMontant(bien.prix, bien.devise) : null;
  const prix = montant ? (bien?.periode ? t(`periode.${bien.periode}`, { prix: montant }) : montant) : null;
  const jour = (valeur: string) =>
    format.dateTime(new Date(`${valeur}T12:00:00Z`), { weekday: 'long', day: 'numeric', month: 'short' });
  const dates = intention.dates;
  const date = dates
    ? dates.fin
      ? t('dates.du', { debut: jour(dates.debut), fin: jour(dates.fin) })
      : t('dates.aPartirDu', { debut: jour(dates.debut) })
    : null;
  return { prix, date };
}

/**
 * TCK-2604 — le titre de la barre du bureau entre 1024 et 1280 (« Votre demande de visite · Studio
 * meublé à Mermoz ») : le panneau, qui dit le bien dès 1280, n'y paraît pas, et l'en-tête du
 * téléphone s'arrête à 1024. Sans bien, `undefined` : la page déclare l'action seule.
 */
export function useTitreDeLaBarre(intention: (IntentionAffichee & { readonly bien: BienQuitte }) | null): string | undefined {
  const t = useTranslations('auth.porte');
  return intention ? `${t(`actions.${intention.action}.titre`)} · ${intention.bien.titre}` : undefined;
}

/** L'icône du geste : un dossier pour une candidature, le calendrier de la maquette pour le reste. */
function IconeDuGeste({ action, className, strokeWidth }: { readonly action: ActionDEntree; readonly className: string; readonly strokeWidth: number }) {
  return action === 'candidature' ? (
    <FileText className={className} strokeWidth={strokeWidth} aria-hidden="true" />
  ) : (
    <CalendarCheck className={className} strokeWidth={strokeWidth} aria-hidden="true" />
  );
}

function Photo({ bien, sizes, className }: { readonly bien: BienQuitte; readonly sizes: string; readonly className?: string }) {
  if (!bien.photo) return <span aria-hidden="true" className={cn('absolute inset-0 bg-muted', className)} />;
  return <Image src={bien.photo} alt="" fill sizes={sizes} className={cn('object-cover', className)} />;
}

/**
 * Téléphone, écran du numéro : la photo du bien quitté (176 px) porte le retour, la marque,
 * l'action et le bien — et « Recevoir un code » reste au-dessus du clavier (`EnTeteBien`).
 */
export function EnTeteDuBien({ intention, retour }: { readonly intention: IntentionAffichee & { readonly bien: BienQuitte }; readonly retour: ReactNode }) {
  const t = useTranslations('auth.porte');
  const tCommun = useTranslations('common');
  const { prix, date } = useDetailsDuBien(intention);
  return (
    <div data-en-tete-du-bien="" className="relative h-44 overflow-hidden bg-muted">
      <Photo bien={intention.bien} sizes="100vw" className="object-[50%_58%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-scrim/20 to-scrim/30" aria-hidden="true" />
      <div className="absolute inset-x-3 top-3 flex items-center justify-between">
        {retour}
        <span className="inline-flex h-10 items-center rounded-full bg-card px-3.5">
          <Logo nom={tCommun('appName')} />
        </span>
      </div>
      <div className="absolute inset-x-4 bottom-3.5 text-primary-foreground">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]">
          <IconeDuGeste action={intention.action} className="size-3.5" strokeWidth={2} />
          {t(`actions.${intention.action}.titre`)}
        </p>
        <p className="mt-1 truncate font-display text-[22px] font-semibold leading-tight tracking-[-0.01em]">{intention.bien.titre}</p>
        {prix || date ? (
          <p className="mt-0.5 truncate text-sm tabular-nums text-primary-foreground/85">{[prix, date].filter(Boolean).join(' · ')}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Téléphone, écrans qui suivent le numéro : le bien ne disparaît plus, il tient dans la barre de
 * 56 px (`BarreIntention`). La flèche ramène au numéro.
 */
export function BarreDuBien({
  intention,
  libelleRetour,
  onRetour,
}: {
  readonly intention: IntentionAffichee & { readonly bien: BienQuitte };
  readonly libelleRetour: string;
  readonly onRetour: () => void;
}) {
  const t = useTranslations('auth.porte');
  return (
    <header className="flex h-14 items-center border-b border-border/70 bg-background pl-1 pr-4">
      <BoutonFlecheDeRetour libelle={libelleRetour} onClick={onRetour} />
      <span className="relative size-9 flex-none overflow-hidden rounded-lg bg-muted">
        <Photo bien={intention.bien} sizes="36px" />
      </span>
      <div className="ml-2.5 min-w-0 flex-1 leading-tight">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{t(`actions.${intention.action}.titre`)}</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{intention.bien.titre}</p>
      </div>
      <SymboleTakussan className="h-6 w-[34px] flex-none" />
    </header>
  );
}

/** Bureau, écran du numéro : le bien en grand, à gauche — lui, pas une villa à piscine (`PanneauBien`). */
export function PanneauDuBien({ intention }: { readonly intention: IntentionAffichee & { readonly bien: BienQuitte } }) {
  const t = useTranslations('auth.porte');
  const { prix, date } = useDetailsDuBien(intention);
  return (
    <div className="relative h-full">
      <Photo bien={intention.bien} sizes="45vw" />
      <div className="absolute inset-0 bg-gradient-to-t from-scrim/60 via-scrim/10 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-card p-5 shadow-[0_18px_40px_-18px_color-mix(in_oklab,var(--shadow-color)_55%,transparent)] xl:inset-x-auto xl:bottom-10 xl:left-10 xl:w-[23.75rem]">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{t(`actions.${intention.action}.titre`)}</p>
        <p className="mt-2 font-display text-[22px] font-semibold leading-tight tracking-[-0.01em]">{intention.bien.titre}</p>
        {prix ? <p className="mt-1 font-display text-lg font-semibold tabular-nums text-primary-deep">{prix}</p> : null}
        {date || intention.bien.agence ? (
          <div className="mt-4 space-y-2.5 border-t border-border pt-4 text-sm">
            {date ? (
              <p className="flex items-center gap-2.5">
                <CalendarCheck className="size-4 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
                {date}
              </p>
            ) : null}
            {/* Le délai de réponse de la maquette (« réponse en 2 h environ ») n'est mesuré nulle part : l'agence seule. */}
            {intention.bien.agence ? (
              <p className="flex items-center gap-2.5">
                <Building2 className="size-4 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
                {t('avecAgence', { agence: intention.bien.agence })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** La carte du bien, dans le panneau de reprise de l'écran du code (`CarteIntention`). */
function CarteDuBien({ intention }: { readonly intention: IntentionAffichee & { readonly bien: BienQuitte } }) {
  const t = useTranslations('auth.porte');
  const { prix } = useDetailsDuBien(intention);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="relative size-14 flex-none overflow-hidden rounded-lg bg-muted">
          <Photo bien={intention.bien} sizes="56px" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold">{intention.bien.titre}</p>
          {prix ? <p className="mt-1 text-sm tabular-nums text-muted-foreground">{prix}</p> : null}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm">
        <IconeDuGeste action={intention.action} className="size-4 flex-none text-primary" strokeWidth={1.75} />
        {t(`actions.${intention.action}.carte`)}
      </p>
    </div>
  );
}

/**
 * Bureau, écran du code : « Vous reprenez là où vous en étiez », la carte du bien, et les trois
 * temps — le numéro (fait), le code (en cours), le retour à l'annonce.
 */
export function PanneauDeReprise({
  intention,
  telephone,
}: {
  readonly intention: IntentionAffichee & { readonly bien: BienQuitte };
  readonly telephone: string;
}) {
  const t = useTranslations('auth.porte.code');
  return (
    <div className="flex h-full flex-col justify-center bg-secondary/60 px-14">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t('reprise')}</p>
      <div className="mt-4 max-w-[25rem]">
        <CarteDuBien intention={intention} />
      </div>
      <ol className="mt-8 max-w-[25rem] space-y-4 text-[15px]">
        <li className="flex items-center gap-3">
          <span className="inline-flex size-6 flex-none items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="text-muted-foreground">
            {t.rich('etapeNumero', {
              phone: telephone,
              numero: (chunks) => <span className="tabular-nums">{chunks}</span>,
            })}
          </span>
        </li>
        <li className="flex items-center gap-3 font-semibold" aria-current="step">
          <span className="inline-flex size-6 flex-none items-center justify-center rounded-full border-[1.5px] border-primary">
            <span className="size-2 rounded-full bg-primary" />
          </span>
          {t('etapeCode')}
        </li>
        <li className="flex items-center gap-3 text-muted-foreground">
          <span className="size-6 flex-none rounded-full border-[1.5px] border-border" />
          {/* Où part la demande, quand le geste en est une et que le bien a son agence ; sinon, le retour à l'annonce. */}
          {intention.bien.agence && (intention.action === 'visite' || intention.action === 'reservation' || intention.action === 'candidature')
            ? t(`etapeEnvoi.${intention.action}`, { agence: intention.bien.agence })
            : t('etapeRetour')}
        </li>
      </ol>
    </div>
  );
}

/** L'intention a-t-elle un bien à montrer ? (garde de type pour les pièces ci-dessus) */
export function avecBien(intention: IntentionAffichee | null): intention is IntentionAffichee & { readonly bien: BienQuitte } {
  return intention?.bien != null;
}
