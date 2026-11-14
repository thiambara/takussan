'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Banknote, CalendarDays, Check, CheckCircle2, ChevronRight, Loader2, MapPin, ShieldCheck, Wrench } from 'lucide-react';

import { BOUTON_D_ENTREE, BoutonCollant } from '@/components/auth/BoutonCollant';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { spAccepterInterventionAction } from '@/app/actions/service-provider-onboarding';
import type { Locale } from '@/i18n/config';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { PieceDuProfil } from '@/lib/pieces/pieces';
import type { InterventionDOrigine, ReglagesDuPrestataire } from '@/lib/service-provider-onboarding';
import { heureMuraleADakar, instantADakar } from '@/lib/visites/heure-de-dakar';
import { cn } from '@/lib/utils';

import { NumeroVerifie, TitreDInvite } from './pieces';

/**
 * TCK-2613 — l'écran 2 du prestataire invité : « Une intervention vous attend » (maquette `app-entree-assistants`,
 * approche a, « Prestataire : l'intervention »). La demande que l'agence a jointe à l'invitation, « Accepter » ou
 * « Proposer un créneau » (décision du porteur du 2026-11-10, point 11 b), puis « Complétez votre profil pour en
 * recevoir d'autres ».
 *
 * ⚠ **L'ordre des appels est imposé par l'API.** Avant la fin d'onboarding, la demande n'est pas assignée au
 * prestataire : `POST …/accept` rendrait 403. « Accepter » finalise donc d'abord (`finaliser`, qui l'assigne —
 * `ServiceProviderOnboardingService::assignDeepLinkedRequest`), puis accepte. Une fin d'onboarding qui a réussi
 * ne se rejoue pas : un 422 sur le créneau se corrige et se renvoie sans la refaire.
 *
 * La carte ne montre que ce que la route rend avant l'acceptation : titre, catégorie, quartier, photo, devis.
 * L'adresse exacte et le contact du locataire s'ouvrent après (TCK-592, P6).
 */
interface InterventionDuPrestataireProps {
  readonly agence: string | null;
  readonly telephone: string | null;
  readonly intervention: InterventionDOrigine | null;
  /** Le libellé de la catégorie, traduit par la page : l'espace `maintenance` n'est pas servi à l'onboarding. */
  readonly categorie: string | null;
  /** `null` : la lecture a échoué — la liste s'affiche sans rien cocher. */
  readonly reglages: ReglagesDuPrestataire | null;
  readonly pieces: readonly PieceDuProfil[] | null;
  /** Finalise l'onboarding sans quitter l'écran ; `false` si elle a échoué (l'échec est déjà dit). */
  readonly finaliser: () => Promise<boolean>;
  /** Finalise si besoin, puis va à `href`. */
  readonly onAller: (href: string) => void;
  readonly enCours: boolean;
}

const CIBLE = 'rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';
const PROFIL = '/app/profile/professional';

type Acceptee = { readonly scheduledAt: string | null };

export function InterventionDuPrestataire({
  agence,
  telephone,
  intervention,
  categorie,
  reglages,
  pieces,
  finaliser,
  onAller,
  enCours,
}: InterventionDuPrestataireProps) {
  const t = useTranslations('onboarding.invite.prestataire');
  const locale = useLocale() as Locale;
  const decalage = useDecalageDuClavier();
  const id = useId();
  const [creneauOuvert, setCreneauOuvert] = useState(false);
  const [creneau, setCreneau] = useState('');
  const [erreurDuCreneau, setErreurDuCreneau] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [acceptee, setAcceptee] = useState<Acceptee | null>(null);

  async function accepter(avecCreneau: boolean) {
    if (!intervention || envoi) return;
    if (avecCreneau && creneau === '') {
      setErreurDuCreneau(t('creneau.requis'));
      return;
    }
    setEnvoi(true);
    setErreur(null);
    setErreurDuCreneau(null);
    try {
      if (!(await finaliser())) return;
      const scheduledAt = avecCreneau ? instantADakar(creneau.slice(0, 10), creneau.slice(11, 16)) : null;
      const res = await spAccepterInterventionAction(intervention.id, scheduledAt);
      if (!res.ok) {
        // Un créneau refusé s'écrit SOUS le champ, et l'intervention reste à accepter.
        const surLeCreneau = res.errors?.scheduled_at?.[0];
        if (avecCreneau && (surLeCreneau || res.status === 422)) setErreurDuCreneau(surLeCreneau ?? res.message);
        else setErreur(res.message);
        return;
      }
      setAcceptee({ scheduledAt: res.data.scheduled_at });
    } finally {
      setEnvoi(false);
    }
  }

  const occupe = envoi || enCours;
  const lien = cn('inline-flex min-h-11 items-center text-sm font-medium text-primary underline decoration-1 underline-offset-4 disabled:opacity-50', CIBLE);

  return (
    <div className="mx-auto grid w-full grid-cols-1 lg:max-w-[33.75rem] xl:max-w-none xl:grid-cols-[minmax(0,33.75rem)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:gap-x-14">
      <div className="min-w-0 xl:col-start-1 xl:row-start-1">
        <NumeroVerifie telephone={telephone} />
        {intervention ? (
          <>
            <TitreDInvite className="mt-4 lg:mt-5">{t('titre')}</TitreDInvite>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground lg:mt-3 lg:text-base">
              {agence ? t('texte', { agence }) : t('texteSans')}
            </p>
            <CarteIntervention intervention={intervention} categorie={categorie} agence={agence} acceptee={acceptee} locale={locale} />

            {creneauOuvert && !acceptee ? (
              <div className="mt-4">
                <Label htmlFor={`${id}-creneau`} className="mb-1.5">
                  {t('creneau.libelle')}
                </Label>
                <Input
                  id={`${id}-creneau`}
                  type="datetime-local"
                  min={heureMuraleADakar()}
                  value={creneau}
                  onChange={(e) => {
                    setErreurDuCreneau(null);
                    setCreneau(e.target.value);
                  }}
                  aria-describedby={erreurDuCreneau ? `${id}-creneau-erreur` : `${id}-creneau-aide`}
                  aria-invalid={erreurDuCreneau ? true : undefined}
                />
                {erreurDuCreneau ? (
                  <p id={`${id}-creneau-erreur`} role="alert" data-erreur-du-creneau="" className="mt-1.5 text-[0.8125rem] text-destructive">
                    {erreurDuCreneau}
                  </p>
                ) : (
                  <p id={`${id}-creneau-aide`} className="mt-1.5 text-[0.8125rem] text-muted-foreground">
                    {t('creneau.aide')}
                  </p>
                )}
              </div>
            ) : null}
            {erreur ? (
              <p role="alert" className="mt-3 text-[0.8125rem] text-destructive">
                {erreur}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <TitreDInvite className="mt-4 lg:mt-5">{agence ? t('sans.titre', { agence }) : t('sans.titreSans')}</TitreDInvite>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground lg:mt-3 lg:text-base">{t('sans.texte')}</p>
          </>
        )}
      </div>

      <aside className="mt-7 min-w-0 lg:order-3 lg:mt-10 xl:order-none xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:pt-13">
        <ProfilACompleter reglages={reglages} pieces={pieces} titre={intervention ? t('profil.titre') : t('profil.titreSans')} onAller={onAller} occupe={occupe} />
        {intervention && !acceptee ? (
          <p className="flex justify-center lg:justify-start">
            <button type="button" disabled={occupe} onClick={() => onAller('/app')} className={cn('mt-2', lien)}>
              {t('plusTard')}
            </button>
          </p>
        ) : null}
      </aside>

      <div className="min-w-0 lg:order-2 xl:order-none xl:col-start-1 xl:row-start-2">
        <BoutonCollant decalage={decalage} className="lg:mt-6">
          {intervention && !acceptee ? (
            creneauOuvert ? (
              // Le geste principal d'abord dans le DOM (ordre du bureau, et de la tabulation) ; au téléphone, à droite.
              <div className="grid grid-cols-[1fr_1.15fr] gap-2 lg:flex lg:gap-3">
                <Button type="button" disabled={occupe} onClick={() => void accepter(true)} className={cn(BOUTON_D_ENTREE, 'order-last px-3 lg:order-none lg:w-auto')}>
                  {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {envoi ? t('acceptation') : t('creneau.envoyer')}
                </Button>
                <Button type="button" variant="outline" disabled={occupe} onClick={() => setCreneauOuvert(false)} className={cn(BOUTON_D_ENTREE, 'border border-foreground/20 bg-card px-3 text-foreground lg:w-auto')}>
                  {t('creneau.annuler')}
                </Button>
              </div>
            ) : (
              // Maquette a-2 : « Accepter » à gauche au bureau, à droite au téléphone. L'ordre du DOM est
              // celui du bureau, où la tabulation sert ; `order-last` ne déplace que le dessin du téléphone.
              <div className="grid grid-cols-[1fr_1.15fr] gap-2 lg:flex lg:gap-3">
                <Button type="button" disabled={occupe} onClick={() => void accepter(false)} className={cn(BOUTON_D_ENTREE, 'order-last px-3 lg:order-none lg:w-auto')}>
                  {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {envoi ? t('acceptation') : t('accepter')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={occupe}
                  onClick={() => setCreneauOuvert(true)}
                  className={cn(BOUTON_D_ENTREE, 'border border-foreground/20 bg-card px-3 text-foreground lg:w-auto')}
                >
                  {t('proposer')}
                </Button>
              </div>
            )
          ) : intervention && acceptee ? (
            <div className="grid grid-cols-1 gap-2 lg:flex lg:items-center lg:gap-4">
              <Button type="button" disabled={occupe} onClick={() => onAller(`/app/maintenance/${intervention.id}`)} className={cn(BOUTON_D_ENTREE, 'lg:w-auto')}>
                {t('acceptee.voir')}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <button type="button" disabled={occupe} onClick={() => onAller('/app')} className={cn('hidden lg:inline-flex', lien)}>
                {t('allerAMonEspace')}
              </button>
            </div>
          ) : (
            <Button type="button" disabled={occupe} onClick={() => onAller('/app')} className={cn(BOUTON_D_ENTREE, 'lg:w-auto')}>
              {enCours ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t('ouverture')}
                </>
              ) : (
                <>
                  {t('allerAMonEspace')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          )}
        </BoutonCollant>
      </div>
    </div>
  );
}

function CarteIntervention({
  intervention,
  categorie,
  agence,
  acceptee,
  locale,
}: {
  readonly intervention: InterventionDOrigine;
  readonly categorie: string | null;
  readonly agence: string | null;
  readonly acceptee: Acceptee | null;
  readonly locale: Locale;
}) {
  const t = useTranslations('onboarding.invite.prestataire');
  const lieu = [intervention.place?.quarter, intervention.place?.city].filter(Boolean).join(', ');
  const photo = intervention.photo ?? null;

  return (
    <div
      data-testid={`intervention-${intervention.id}`}
      className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_14px_32px_-22px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)] lg:mt-7"
    >
      {photo ? (
        <div className="relative h-40 bg-muted lg:h-44">
          {/* URL signée et privée, servie par l'API : pas d'optimiseur ni de loader de médias publics. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.thumbnail_url} alt={t('carte.photo')} className="size-full object-cover" />
          {photo.count > 1 ? (
            <span className="absolute bottom-3 right-3 rounded-full bg-foreground/75 px-2 py-0.5 text-xs font-medium text-background">
              {t('carte.photos', { compte: photo.count })}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="p-4 lg:p-6">
        <p className="font-display text-xl font-semibold tracking-[-0.01em] lg:text-2xl">{intervention.title || t('carte.sansTitre')}</p>
        {categorie || lieu ? (
          <p className="mt-1 flex items-center gap-1.5 text-[0.9375rem]">
            {lieu ? <MapPin className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" /> : null}
            <span className="min-w-0 truncate">{[categorie, lieu].filter(Boolean).join(' · ')}</span>
          </p>
        ) : null}
        {intervention.quote ? (
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            {t('carte.devis', { montant: formatCurrency(intervention.quote.amount, locale, { currency: intervention.quote.currency ?? 'XOF' }) })}
          </p>
        ) : null}
        {acceptee ? (
          <div role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 flex-none text-success" aria-hidden="true" />
            <span>
              <span className="block font-semibold">{t('acceptee.titre')}</span>
              <span className="block text-foreground">
                {acceptee.scheduledAt
                  ? t('acceptee.passage', { date: formatDateTime(acceptee.scheduledAt, locale, { dateStyle: 'full', timeStyle: 'short' }) })
                  : t('acceptee.sansPassage')}
              </span>
            </span>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-[0.8125rem] leading-snug text-foreground">{t('carte.adresseApres')}</p>
        )}
        {agence ? (
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
            <span aria-hidden="true" className="inline-flex size-9 flex-none items-center justify-center rounded-[0.625rem] bg-accent font-display text-sm font-semibold text-accent-foreground">
              {agence
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((m) => m.charAt(0).toUpperCase())
                .join('')}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{t('carte.demandeDe', { agence })}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProfilACompleter({
  reglages,
  pieces,
  titre,
  onAller,
  occupe,
}: {
  readonly reglages: ReglagesDuPrestataire | null;
  readonly pieces: readonly PieceDuProfil[] | null;
  readonly titre: string;
  readonly onAller: (href: string) => void;
  readonly occupe: boolean;
}) {
  const t = useTranslations('onboarding.invite.prestataire.profil');
  const tMetier = useTranslations('serviceProviders.onboarding.trades.options');
  const locale = useLocale() as Locale;
  const id = useId();

  const metiers = (reglages?.trades ?? []).map((m) => (tMetier.has(m) ? tMetier(m) : m));
  const zones = reglages?.intervention_zones ?? [];
  const horaire = reglages?.hourly_rate !== null && reglages?.hourly_rate !== undefined ? Number(reglages.hourly_rate) : null;
  const visite = reglages?.visit_fee ?? null;
  const creneaux = reglages?.available_slots.length ?? 0;
  const assurance = (pieces ?? []).find((p) => p.code === 'insurance');
  const assuranceEnvoyee = assurance?.state === 'sent' || assurance?.state === 'verified';

  const lignes = [
    { cle: 'metiers', Icone: Wrench, fait: metiers.length > 0, valeur: metiers.length > 0 ? metiers.join(', ') : t('metiers.vide'), href: PROFIL },
    { cle: 'zones', Icone: MapPin, fait: zones.length > 0, valeur: zones.length > 0 ? zones.join(', ') : t('zones.vide'), href: PROFIL },
    {
      cle: 'tarifs',
      Icone: Banknote,
      fait: horaire !== null && visite !== null,
      valeur:
        horaire !== null && visite !== null
          ? t('tarifs.fait', { horaire: formatCurrency(horaire, locale), visite: formatCurrency(visite, locale) })
          : t('tarifs.vide'),
      href: PROFIL,
    },
    {
      cle: 'disponibilites',
      Icone: CalendarDays,
      fait: creneaux > 0,
      valeur: creneaux > 0 ? t('disponibilites.fait', { compte: creneaux }) : t('disponibilites.vide'),
      href: PROFIL,
    },
    {
      cle: 'assurance',
      Icone: ShieldCheck,
      fait: assuranceEnvoyee,
      valeur: assuranceEnvoyee ? t('assurance.fait') : t('assurance.vide'),
      href: '/app/pieces',
    },
  ] as const;
  const faits = lignes.filter((l) => l.fait).length;

  return (
    <section aria-labelledby={`${id}-titre`} data-testid="profil-a-completer">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-titre`} className="text-[0.9375rem] font-semibold lg:text-[1.0625rem]">
          {titre}
        </h2>
        <span className="flex-none text-[0.8125rem] tabular-nums text-muted-foreground">{t('compte', { faits, total: lignes.length })}</span>
      </div>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {lignes.map(({ cle, Icone, fait, valeur, href }) => (
          <li key={cle}>
            <button
              type="button"
              disabled={occupe}
              onClick={() => onAller(href)}
              data-ligne-du-profil={cle}
              className={cn('flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 disabled:opacity-60', CIBLE)}
            >
              <Icone className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[0.9375rem] font-medium">{t(`${cle}.nom`)}</span>
                <span className="block truncate text-[0.8125rem] text-muted-foreground">{valeur}</span>
              </span>
              {fait ? (
                <span className="inline-flex size-6 flex-none items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                  <span className="sr-only">{t('fait')}</span>
                </span>
              ) : (
                <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
