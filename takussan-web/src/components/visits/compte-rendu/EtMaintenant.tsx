'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarPlus,
  ChevronRight,
  CircleHelp,
  ClipboardPen,
  Clock,
  FileSignature,
  Home,
  Link2,
  Lock,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

import { SaisirUneDemande } from '@/components/bookings/SaisirUneDemande';
import { CustomerMatches } from '@/components/crm/CustomerMatches';
import { isReachable, whatsappHref } from '@/components/crm/contact';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { useAuth } from '@/context/AuthContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import { AGENT_CRM_QUERY_KEY, fetchMatchingProperties } from '@/lib/queries/agent-crm';
import { useUpdateVisitReport } from '@/lib/queries/visits';
import {
  SUITES_SUR_FICHE,
  echeanceDeRelance,
  etapeAProposer,
  lienDInvitation,
  suitesDeLaVisite,
  type CompteRendu,
  type NatureDeLaSuite,
  type Suite,
  type Verdict,
} from '@/lib/visites/compte-rendu';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';
import { cn } from '@/lib/utils';

/** Le bien de la visite, relu (la visite n'en porte ni la nature ni la photo). */
export interface BienDeLaSuite {
  readonly id: number;
  readonly titre: string;
  readonly slug: string | null;
  readonly nature: NatureDeLaSuite | null;
  /**
   * Le bien est-il servi par sa fiche publique (`is_online`, TCK-2637) ? `false` : l'invitation
   * WhatsApp mènerait le client à une page introuvable, elle reste inactive et dit pourquoi. `null` :
   * pas encore su — inactive aussi, mais SANS ce motif (il s'afficherait puis disparaîtrait à tort).
   */
  readonly enLigne: boolean | null;
}

interface EtMaintenantProps {
  readonly visite: PropertyVisit;
  /**
   * Le compte rendu enregistré. `null` : l'APERÇU grisé d'avant l'enregistrement (la colonne du
   * bureau, maquette a-4) — la liste seule, inerte, conseillée selon le verdict en cours de saisie.
   */
  readonly compteRendu: CompteRendu | null;
  /** Aperçu : le verdict touché mais pas encore enregistré. */
  readonly verdictEnCours?: Verdict | null;
  /** `null` tant que le bien se relit : la liste attend (un libellé faux ne s'affiche jamais). */
  readonly bien: BienDeLaSuite | null;
  /** L'étape proposée par la réponse de l'écriture, quand elle vient d'avoir lieu. */
  readonly etapeSuggeree?: { readonly from: string; readonly to: string } | null;
  readonly densite: 'telephone' | 'colonne';
  readonly onModifier: () => void;
  /** Après « Terminer » (au téléphone : retour au détail). */
  readonly onTermine?: () => void;
}

const ICONE_DU_VERDICT: Record<Verdict, LucideIcon> = { interested: ThumbsUp, thinking: CircleHelp, not_interested: ThumbsDown };

type Ton = 'neutre' | 'primaire' | 'whatsapp';
const TONS: Record<Ton, string> = {
  neutre: 'bg-muted text-encre-douce',
  primaire: 'bg-secondary text-primary-deep',
  whatsapp: 'bg-success text-success-foreground',
};

const JOURS_DE_RELANCE = [1, 2, 3, 7] as const;

interface Fiche {
  readonly id: number;
  readonly first_name?: string | null;
  readonly pipeline_stage?: string | null;
}

/**
 * L'étape de la fiche, relue. `/api/customers/{id}` est un `show` : il rend la fiche entière et
 * ignore `fields` (P60.03, `show-sans-fields.garde.test.ts`) — d'où une déclaration à part, sans
 * paramètres.
 */
function useEtapeDeLaFiche(clientId: number | null) {
  return useApiQuery<ApiResponse<Fiche>>(['customers', 'etape', clientId ?? 0], cheminApi`/api/customers/${clientId ?? 0}`, {
    enabled: clientId !== null,
  });
}

/**
 * TCK-2581 (ADR-0101 § 3) — « Et maintenant ? » : le résumé du compte rendu (« Modifier »), puis les
 * suites dans l'ordre utile, la conseillée en tête et dépliée, et l'interrupteur « Passer <prénom>
 * en « Qualifié » » (décision 2a). Maquette `app-fil-commercial`, écran 5 (`SuiteMobile`, et la
 * colonne droite de `VisiteTermineeBureau`).
 *
 * Chaque suite passe par une route EXISTANTE ; le serveur ne trace que le choix (`follow_up`,
 * `PATCH …/report`). L'étape ne change qu'à la validation : le choix d'une suite, ou « Terminer ».
 */
export function EtMaintenant({ visite, compteRendu, verdictEnCours = null, bien, etapeSuggeree, densite, onModifier, onTermine }: EtMaintenantProps) {
  const t = useTranslations('etMaintenant');
  const tCR = useTranslations('compteRendu');
  const tEtapes = useTranslations('crm.pipeline.stage');
  const tSaisie = useTranslations('saisieDemande');
  const locale = useLocale();
  const f = useFormatteurs();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const telephone = densite === 'telephone';
  const apercu = compteRendu === null;
  const verdict = compteRendu?.outcome ?? verdictEnCours;

  const client = visite.customer ?? null;
  const nomClient = client ? nomAffichable(client) : visite.visitor_name?.trim() || t('visiteur');
  const prenom = client?.first_name?.trim() || nomClient.split(/\s+/)[0] || nomClient;
  const numero = client?.phone ?? visite.visitor_display?.phone ?? visite.visitor_phone ?? null;

  // L'étape de la fiche : l'API ne rend `suggested_stage` qu'à l'écriture ; rouvert, l'écran la lit.
  // La fiche relue fait foi dès qu'elle est là : `etapeSuggeree.from` est l'étape AVANT l'écriture du
  // compte rendu, et reste dans `SuiteDeLaVisite` quand cet écran se démonte (« Modifier », puis retour).
  const fiche = useEtapeDeLaFiche(client?.id ?? null);
  const etapeActuelle = fiche.data?.data.pipeline_stage ?? etapeSuggeree?.from ?? null;
  const etapeOuverte = etapeActuelle === 'lead' || etapeActuelle === 'prospect';
  const proposee = etapeSuggeree ? etapeSuggeree.to === 'qualified' : etapeAProposer(verdict, etapeActuelle);
  const [qualifier, setQualifier] = useState<boolean | null>(null);
  const allume = qualifier ?? proposee;
  const [etapeAppliquee, setEtapeAppliquee] = useState(false);

  const correspondances = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.matchingProperties(client?.id ?? 0),
    queryFn: () => fetchMatchingProperties(token ?? '', client?.id ?? 0),
    enabled: !!token && client !== null,
  });

  // « Créer le bail » : une candidature ACCEPTÉE de ce client sur ce bien (P48.03).
  const candidature = useApiQuery<PaginatedResponse<{ readonly id: number }>>(
    ['bookings', 'list', 'candidature-acceptee', client?.id ?? 0, bien?.id ?? 0],
    '/api/bookings',
    {
      params: {
        fields: { bookings: ['id'] },
        filter: { customer_id: String(client?.id ?? 0), property_id: String(bien?.id ?? 0), kind: 'application', status: 'confirmed' },
        per_page: 1,
      },
      enabled: client !== null && bien?.nature === 'application',
    },
  );
  const reservationAcceptee = candidature.data?.data[0]?.id ?? null;

  const suite = useUpdateVisitReport(visite.id);
  const etape = useApiMutation<ApiResponse<unknown>, { pipeline_stage: 'qualified' }>(
    { path: cheminApi`/api/customers/${client?.id ?? 0}/pipeline-stage`, method: 'PATCH' },
    { invalidate: [['customers']] },
  );
  const relance = useApiMutation<ApiResponse<{ readonly id: number }>, Record<string, unknown>>({ path: '/api/tasks', method: 'POST' }, { invalidate: [['tasks'], ['agent-crm']] });

  const [saisir, setSaisir] = useState(false);
  const [planifier, setPlanifier] = useState(false);
  const [autresBiens, setAutresBiens] = useState(false);
  const [joursDeRelance, setJoursDeRelance] = useState<number>(2);
  const [ouverte, setOuverte] = useState<Suite | null>(null);
  const [relancePrevue, setRelancePrevue] = useState<string | null>(null);
  const [maintenant] = useState(() => new Date());

  const { suites, conseillee } = suitesDeLaVisite(verdict, bien?.nature ?? null);
  const depliee = apercu ? null : ouverte ?? (conseillee === 'invite_apply' || conseillee === 'invite_offer' ? conseillee : null);

  async function appliquerEtape() {
    if (!client || !etapeOuverte || !allume || etapeAppliquee) return;
    // Relue AVANT d'écrire : le PATCH n'a pas de précondition, et l'étape a pu avancer depuis
    // l'ouverture de l'écran (un collègue, une candidature) — on n'écrase jamais une étape au-delà
    // de « Prospect ». C'est aussi ce qui tient la seconde validation quand l'écran a été remonté.
    const relue = (await fiche.refetch()).data?.data.pipeline_stage ?? etapeActuelle;
    if (relue !== 'lead' && relue !== 'prospect') return;
    await etape.mutateAsync({ pipeline_stage: 'qualified' });
    setEtapeAppliquee(true);
    toast.add({ title: t('etapeAppliquee', { prenom }), type: 'success' });
  }

  async function choisir(s: Suite) {
    if (!compteRendu) return;
    try {
      await appliquerEtape();
      if (compteRendu.follow_up !== s) await suite.mutateAsync({ follow_up: s });
    } catch (err) {
      toast.add({ title: messageErreur(err), type: 'error' });
    }
  }

  async function terminer() {
    try {
      await appliquerEtape();
      onTermine?.();
    } catch (err) {
      toast.add({ title: messageErreur(err), type: 'error' });
    }
  }

  async function creerRelance() {
    if (!client) return;
    const echeance = echeanceDeRelance(maintenant, joursDeRelance);
    try {
      await relance.mutateAsync({
        title: t('suites.remind.tacheTitre', { nom: nomClient }),
        description: t('suites.remind.tacheDescription', { bien: bien?.titre ?? '' }),
        due_at: echeance,
        taskable_id: client.id,
        taskable_type: 'App\\Models\\Customer',
      });
      setRelancePrevue(echeance);
      setOuverte(null);
      await choisir('remind');
    } catch (err) {
      toast.add({ title: messageErreur(err), type: 'error' });
    }
  }

  const jourCourt = (iso: string) => f.date(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const lien = bien?.slug && typeof window !== 'undefined' ? lienDInvitation(window.location.origin, locale, bien.slug) : null;
  const message = lien
    ? t(bien?.nature === 'offer' ? 'message.offre' : 'message.candidature', { prenom, bien: bien?.titre ?? '', lien })
    : null;

  function ligne(s: Suite): ReactNode {
    const sansFiche = client === null && SUITES_SUR_FICHE.has(s);
    const conseil = s === conseillee ? <Conseille libelle={t('conseille')} /> : null;
    switch (s) {
      case 'invite_apply':
      case 'invite_offer': {
        const enLigne = bien?.enLigne ?? null;
        const invitable = isReachable(numero) && message !== null;
        const joignable = enLigne === true && invitable;
        return (
          <LigneDeSuite
            key={s}
            icone={Link2}
            ton="whatsapp"
            titre={<>{t(`suites.${s}.titre`)}{conseil}</>}
            detail={enLigne === false ? t('horsLigne') : invitable ? t(`suites.${s}.detail`) : t('sansTelephone')}
            inactif={!joignable}
            ouverte={joignable && depliee === s}
            onClick={() => setOuverte(depliee === s ? null : s)}
          >
            {joignable && depliee === s ? (
              <div data-slot="apercu-whatsapp" className="mt-3 rounded-xl bg-success/10 p-3">
                <p className="rounded-xl bg-card px-3 py-2.5 text-corps leading-relaxed text-pretty break-words shadow-sm">
                  {lien && message.includes(lien) ? (
                    <>
                      {message.slice(0, message.indexOf(lien))}
                      <span className="text-primary underline underline-offset-2">{lien}</span>
                      {message.slice(message.indexOf(lien) + lien.length)}
                    </>
                  ) : (
                    message
                  )}
                </p>
                <a
                  href={whatsappHref(numero, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void choisir(s)}
                  className="mt-2.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-success px-3.5 text-corps font-semibold text-success-foreground outline-none transition-colors hover:bg-success/90 focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <IconeWhatsApp />
                  {t('envoyerWhatsApp')}
                </a>
              </div>
            ) : null}
          </LigneDeSuite>
        );
      }
      case 'record_booking':
        return (
          <LigneDeSuite
            key={s}
            icone={ClipboardPen}
            ton="primaire"
            titre={<>{t(bien?.nature === 'offer' ? 'suites.record_booking.titreOffre' : 'suites.record_booking.titreCandidature')}{conseil}</>}
            detail={sansFiche ? t('ficheRequise') : t(bien?.nature === 'offer' ? 'suites.record_booking.detailOffre' : 'suites.record_booking.detailCandidature')}
            inactif={sansFiche}
            onClick={() => setSaisir(true)}
          />
        );
      case 'second_visit':
        return (
          <LigneDeSuite
            key={s}
            icone={CalendarPlus}
            titre={<>{t('suites.second_visit.titre')}{conseil}</>}
            detail={t('suites.second_visit.detail')}
            onClick={() => setPlanifier(true)}
          />
        );
      case 'propose_properties': {
        const n = correspondances.data?.data.length;
        return (
          <LigneDeSuite
            key={s}
            icone={Home}
            titre={<>{t('suites.propose_properties.titre')}{conseil}</>}
            detail={sansFiche ? t('ficheRequise') : n === undefined ? t('suites.propose_properties.chargement') : t('suites.propose_properties.detail', { n })}
            inactif={sansFiche}
            onClick={() => {
              setAutresBiens(true);
              void choisir(s);
            }}
          />
        );
      }
      case 'remind':
        return (
          <LigneDeSuite
            key={s}
            icone={Clock}
            titre={<>{t('suites.remind.titre', { jours: joursDeRelance })}{conseil}</>}
            detail={
              sansFiche
                ? t('ficheRequise')
                : relancePrevue
                  ? t('suites.remind.prevue', { date: jourCourt(relancePrevue) })
                  : t('suites.remind.detail', { date: jourCourt(echeanceDeRelance(maintenant, joursDeRelance)) })
            }
            inactif={sansFiche}
            ouverte={depliee === 'remind'}
            onClick={() => setOuverte(depliee === 'remind' ? null : 'remind')}
          >
            {depliee === 'remind' ? (
              <div className="mt-3 space-y-3 pl-13">
                <div role="radiogroup" aria-label={t('suites.remind.delai')} className="flex flex-wrap gap-2">
                  {JOURS_DE_RELANCE.map((j) => (
                    <button
                      key={j}
                      type="button"
                      role="radio"
                      aria-checked={joursDeRelance === j}
                      onClick={() => setJoursDeRelance(j)}
                      className={cn(
                        'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
                        joursDeRelance === j ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted/50',
                      )}
                    >
                      {t('suites.remind.jours', { jours: j })}
                    </button>
                  ))}
                </div>
                <Button type="button" onClick={() => void creerRelance()} disabled={relance.isPending}>
                  {t('suites.remind.creer')}
                </Button>
              </div>
            ) : null}
          </LigneDeSuite>
        );
      case 'create_lease': {
        const actif = reservationAcceptee !== null;
        return (
          <LigneDeSuite
            key={s}
            icone={FileSignature}
            titre={<>{t('suites.create_lease.titre')}{conseil}</>}
            detail={actif ? t('suites.create_lease.actif') : t('suites.create_lease.inactif')}
            inactif={!actif}
            droite={actif ? undefined : <Lock className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />}
            href={actif ? `/app/leases/new?booking_id=${reservationAcceptee}` : undefined}
            onClick={() => void choisir('create_lease')}
          />
        );
      }
    }
  }

  const liste =
    bien === null ? (
      <Skeleton className="h-80 rounded-xl" />
    ) : (
      <div className="divide-y divide-border rounded-xl border border-border bg-card">{suites.map((s) => ligne(s))}</div>
    );

  if (!compteRendu) {
    return (
      <div data-slot="et-maintenant-a-venir" inert className="space-y-3 opacity-45">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-lg font-semibold tracking-titre text-foreground">{t('titre')}</h2>
          <span className="text-ui text-muted-foreground">{t('apresEnregistrement')}</span>
        </div>
        {liste}
      </div>
    );
  }

  const resume = (
    <ResumeDuCompteRendu
      compteRendu={compteRendu}
      verdict={tCR(`verdicts.${compteRendu.outcome}`)}
      objections={compteRendu.objections.map((o) => tCR(`objections.${o}`))}
      enregistre={
        compteRendu.reported_at
          ? t(client ? 'enregistreFiche' : 'enregistre', { heure: f.heure(compteRendu.reported_at) })
          : null
      }
      modifier={t('modifier')}
      onModifier={onModifier}
    />
  );

  const interrupteur =
    client && etapeOuverte && !etapeAppliquee ? (
      <label data-slot="passer-en-qualifie" className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-secondary text-primary-deep">
          <TrendingUp className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug">
          <span className="block font-semibold text-foreground">{t('qualifier')}</span>
          <span className="block text-ui text-muted-foreground">{t('aujourdhui', { etape: tEtapes(etapeActuelle ?? 'prospect') })}</span>
        </span>
        <Switch checked={allume} onCheckedChange={(v) => setQualifier(v)} />
      </label>
    ) : (
      <span className="flex-1" />
    );

  const pied = (
    <div className="flex items-center gap-3">
      {interrupteur}
      <Button type="button" variant={telephone ? 'default' : 'outline'} size={telephone ? 'lg' : 'default'} onClick={() => void terminer()} disabled={etape.isPending}>
        {t('terminer')}
      </Button>
    </div>
  );

  return (
    <div data-slot="et-maintenant" className={cn('space-y-4', telephone && 'px-4')}>
      {resume}
      {!telephone ? (
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-lg font-semibold tracking-titre text-foreground">{t('titre')}</h3>
          <span className="text-ui text-muted-foreground">{t('sousTitre', { prenom })}</span>
        </div>
      ) : null}

      {client === null ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 text-sm">
          <p className="min-w-0 flex-1 text-pretty text-foreground">{t('sansFiche', { nom: nomClient })}</p>
          {/* TCK-2716 — le geste, sous le seul booléen de l'API : le prédicat de `POST /api/customers`. */}
          {visite.abilities?.create_customer === true ? (
            <Link
              // L'identifiant de la visite, et lui seul : la page la relit au serveur (`ficheDuVisiteur`).
              // Un numéro dans l'URL part dans l'historique, les journaux et l'en-tête `Referer`.
              href={`/app/customers/new?visite=${visite.id}`}
              className="inline-flex h-10 flex-none items-center gap-1.5 rounded-lg border border-border bg-card px-3 font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
            >
              <UserPlus className="size-4" strokeWidth={1.75} aria-hidden />
              {t('creerFiche')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {liste}

      <p className="px-1 text-ui leading-snug text-muted-foreground">{t('fil')}</p>

      {telephone ? (
        <BarreDAction>{pied}</BarreDAction>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3.5">{pied}</div>
      )}

      {saisir && client && bien ? (
        <SaisirUneDemande
          open
          onOpenChange={(o) => !o && setSaisir(false)}
          client={{ id: client.id, nom: nomClient, detail: tSaisie('client.depuisLaVisite') }}
          bien={{ id: bien.id, titre: bien.titre }}
          onSuccess={() => {
            setSaisir(false);
            void choisir('record_booking');
          }}
        />
      ) : null}
      {planifier && bien ? (
        <PlanifierDialog
          property={{ id: bien.id, libelle: bien.titre }}
          customer={client ? { id: client.id, libelle: nomClient, telephone: numero } : undefined}
          onClose={() => setPlanifier(false)}
          onPlanifiee={() => void choisir('second_visit')}
        />
      ) : null}
      {client ? (
        <PanneauDroit open={autresBiens} onOpenChange={(o) => setAutresBiens(o)} titre={t('suites.propose_properties.titre')}>
          <CustomerMatches customerId={client.id} firstName={prenom} phone={numero} />
        </PanneauDroit>
      ) : null}
    </div>
  );
}

function Conseille({ libelle }: { readonly libelle: string }) {
  return (
    <span data-slot="conseille" className="ml-2 inline-flex h-5 items-center rounded-full bg-secondary px-2 align-middle text-legende font-semibold text-primary-deep">
      {libelle}
    </span>
  );
}

/**
 * Une suite : pastille d'icône de 40 px, titre de 15 px, une ligne, chevron (maquette `Choix`). Un
 * bouton, ou un lien quand `href` est donné ; inactive, une ligne qui dit pourquoi, sans geste.
 */
function LigneDeSuite({
  icone: Icone,
  ton = 'neutre',
  titre,
  detail,
  inactif,
  ouverte,
  droite,
  href,
  onClick,
  children,
}: {
  readonly icone: LucideIcon;
  readonly ton?: Ton;
  readonly titre: ReactNode;
  readonly detail?: ReactNode;
  readonly inactif?: boolean;
  readonly ouverte?: boolean;
  readonly droite?: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly children?: ReactNode;
}) {
  const corps = (
    <>
      <span className={cn('inline-flex size-10 flex-none items-center justify-center rounded-full', TONS[ton])}>
        <Icone className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-corps font-semibold text-foreground">{titre}</span>
        {detail ? <span className="block text-ui text-muted-foreground">{detail}</span> : null}
      </span>
      {droite ?? (ouverte === undefined || !ouverte ? <ChevronRight className="size-4.5 flex-none text-muted-foreground lg:size-5" strokeWidth={1.75} aria-hidden /> : null)}
    </>
  );
  const classe = 'flex min-h-11 w-full items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring';
  return (
    <div data-slot="suite" className={cn('px-4 py-3', inactif && 'opacity-60')}>
      {inactif ? (
        <div aria-disabled className={classe}>
          {corps}
        </div>
      ) : href ? (
        <Link href={href} onClick={onClick} className={classe}>
          {corps}
        </Link>
      ) : (
        <button type="button" onClick={onClick} aria-expanded={ouverte} className={classe}>
          {corps}
        </button>
      )}
      {children}
    </div>
  );
}

export function ResumeDuCompteRendu({
  compteRendu,
  verdict,
  objections,
  enregistre,
  modifier,
  onModifier,
}: {
  readonly compteRendu: CompteRendu;
  readonly verdict: string;
  readonly objections: readonly string[];
  readonly enregistre: string | null;
  readonly modifier: string;
  readonly onModifier: () => void;
}) {
  const Icone = ICONE_DU_VERDICT[compteRendu.outcome];
  const interesse = compteRendu.outcome === 'interested';
  return (
    <div
      data-slot="resume-compte-rendu"
      className={cn('flex items-center gap-3 rounded-xl border px-3.5 py-3', interesse ? 'border-success/30 bg-success/10' : 'border-border bg-muted/50')}
    >
      <Icone className={cn('size-5 flex-none', interesse ? 'text-success' : 'text-muted-foreground')} strokeWidth={1.75} aria-hidden />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className={cn('font-semibold', interesse ? 'text-success' : 'text-foreground')}>{verdict}</span>
        {objections.length > 0 ? <span className="text-foreground"> · {objections.join(', ')}</span> : null}
        {enregistre ? <span className="block truncate text-muted-foreground">{enregistre}</span> : null}
      </p>
      <button
        type="button"
        onClick={onModifier}
        className="relative inline-flex flex-none items-center gap-1 rounded-md text-ui font-medium text-primary outline-none after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:underline focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden />
        {modifier}
      </button>
    </div>
  );
}
