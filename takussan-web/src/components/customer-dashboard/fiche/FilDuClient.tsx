'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleCheck,
  ClipboardCheck,
  Inbox,
  ListChecks,
  Loader2,
  Mail,
  MessageSquare,
  NotebookPen,
  PhoneOutgoing,
  Pin,
  TrendingUp,
  UserPen,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { noteBody } from '@/components/crm/noteBody';
import { ErrorState } from '@/components/feedback';
import { CitationDuMessage } from '@/components/leads/boite/pieces';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { entreesDesPages, filtreDeLURL, FILTRES_DU_FIL, PARAMETRE_DU_FILTRE, pageSuivante, requeteAvecFiltre, typesDuFiltre, type CleDeFiltre } from '@/lib/crm/fil-du-client';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { AGENT_CRM_QUERY_KEY } from '@/lib/queries/agent-crm';
import { createCustomerNote } from '@/lib/queries/customers';
import { FIL_QUERY_KEY, fetchCustomerTimeline, type EntreeDuFil, type NoteDuFil, type VisiteDuFil } from '@/lib/queries/customer-timeline';
import { createCustomerTask } from '@/lib/queries/pipeline';
import { cn } from '@/lib/utils';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { jourEnClair } from '@/lib/visites/planification';
import type { CustomerDetail, CustomerNote } from '@/types/customer';

import { SurtitreDeLaFiche } from './ResumeDuClient';

/**
 * TCK-2589 (lot C) — le FIL de la fiche client (maquette `app-clients-fiche` a, « Résumé + fil ») :
 * la saisie (note ou tâche) en tête, les notes épinglées, puis notes, visites, gestes de contact et
 * changements d'étape, mêlés dans le temps par l'API (`/timeline`), filtrés par elle, page par page.
 *
 *  · Le filtre vit dans l'URL (`?fil=notes|visites|appels|etapes`) ; « Tout » le retire.
 *  · Les épinglées paraissent DEUX fois — en tête, et à leur date dans le fil — sous des clés distinctes ;
 *    aucun nombre n'est montré, rien ne les compte deux fois.
 *  · Ce qu'un lecteur voit est jugé par l'API : le bailleur auteur ne reçoit ni visite ni geste.
 */

type Mode = 'note' | 'tache';

/** Une demande d'ouvrir la saisie (la barre du bas) : son mode, et un jeton qui change à chaque toucher. */
export interface DemandeDeSaisie {
  readonly mode: Mode;
  readonly jeton: number;
}

const TONS = {
  neutre: 'bg-muted text-encre-douce',
  primaire: 'bg-secondary text-primary-deep',
  succes: 'bg-success/15 text-success',
  attention: 'bg-warning/20 text-warning',
  whatsapp: 'bg-success text-success-foreground',
} as const;

/** Une ligne du fil : pastille d'icône, trait, phrase, date, et un détail facultatif. */
function LigneDuFil({
  icone: Icone,
  ton = 'neutre',
  titre,
  date,
  children,
  dernier,
}: {
  readonly icone: LucideIcon | typeof IconeWhatsApp;
  readonly ton?: keyof typeof TONS;
  readonly titre: ReactNode;
  readonly date: string;
  readonly children?: ReactNode;
  readonly dernier: boolean;
}) {
  return (
    <li className={cn('relative flex gap-3', !dernier && 'pb-4')} data-slot="ligne-du-fil">
      {dernier ? null : <span className="absolute top-8 bottom-0 left-[calc(var(--spacing)*3.75)] w-px bg-border" aria-hidden="true" />}
      <span className={cn('relative inline-flex size-8 flex-none items-center justify-center rounded-full', TONS[ton])} aria-hidden="true">
        <Icone className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-corps leading-snug">{titre}</p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{date}</p>
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </li>
  );
}

function CorpsDeNote({ children }: { readonly children: ReactNode }) {
  return <p className="rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-line text-pretty text-encre-douce">{children}</p>;
}

/** « 8 nov. · 16:40 · Khady Diallo » : l'instant de l'entrée, et son auteur quand l'API le dit. */
function useDateDeLigne(): (at: string, nom?: string | null) => string {
  const t = useTranslations('crm.fiche.fil');
  const f = useFormatteurs();
  return (at, nom) => (nom ? t('quandPar', { jour: f.jourMois(at), heure: f.heure(at), nom }) : t('quand', { jour: f.jourMois(at), heure: f.heure(at) }));
}

/** « jeu. 12 nov. 10:00 » : le rendez-vous d'une visite. */
function useRendezVous(): (at: string) => string {
  const t = useTranslations('crm.fiche.fil');
  const f = useFormatteurs();
  return (at) => t('rendezVous', { jour: jourEnClair(jourADakar(new Date(at)), f.locale), heure: f.heure(at) });
}

function EntreeNote({ note, dernier, epinglee }: { readonly note: NoteDuFil; readonly dernier: boolean; readonly epinglee?: boolean }) {
  const t = useTranslations('crm.fiche.fil');
  const tNotes = useTranslations('agentCrm.notes');
  const tVerdict = useTranslations('compteRendu.verdicts');
  const tObjection = useTranslations('compteRendu.objections');
  const date = useDateDeLigne();
  const auteur = note.author?.name ?? null;
  const punaise = note.pinned ? <Pin className="ml-1.5 inline size-3.5 text-primary" role="img" aria-label={t('epingleeAria')} /> : null;

  if (note.kind === 'lead_message') {
    return (
      <LigneDuFil icone={Inbox} titre={t('demande')} date={date(note.at)} dernier={dernier}>
        {note.body ? <CitationDuMessage message={note.body} /> : null}
      </LigneDuFil>
    );
  }
  if (note.kind === 'visit_report') {
    const verdict = note.report?.outcome && tVerdict.has(note.report.outcome) ? tVerdict(note.report.outcome) : null;
    const objections = (note.report?.objections ?? []).map((o) => (tObjection.has(o) ? tObjection(o) : null)).filter((o): o is string => o !== null);
    return (
      <LigneDuFil icone={ClipboardCheck} ton="succes" titre={verdict ? t('compteRenduVerdict', { verdict }) : t('compteRendu')} date={date(note.at, auteur)} dernier={dernier}>
        {objections.length ? <p className="text-ui text-muted-foreground">{t('objections', { liste: objections.join(', ') })}</p> : null}
        {note.body ? <div className={cn(objections.length && 'mt-1.5')}><CorpsDeNote>{note.body}</CorpsDeNote></div> : null}
      </LigneDuFil>
    );
  }
  return (
    <LigneDuFil
      icone={NotebookPen}
      ton="primaire"
      titre={
        <>
          {t('note')}
          {epinglee ? null : punaise}
        </>
      }
      date={date(note.at, auteur)}
      dernier={dernier}
    >
      {note.body ? <CorpsDeNote>{noteBody({ body: note.body, kind: note.kind ?? undefined }, tNotes)}</CorpsDeNote> : null}
    </LigneDuFil>
  );
}

function EntreeVisite({ visite, dernier }: { readonly visite: VisiteDuFil; readonly dernier: boolean }) {
  const t = useTranslations('crm.fiche.fil.visite');
  const date = useDateDeLigne();
  const rendezVous = useRendezVous();
  const quand = visite.scheduled_at ? rendezVous(visite.scheduled_at) : null;
  const libelle =
    visite.milestone === 'cancelled'
      ? t('cancelled')
      : visite.milestone === 'confirmed'
        ? quand ? t('confirmed', { quand }) : t('confirmedSansHeure')
        : quand ? t('created', { quand }) : t('createdSansHeure');
  const detail = [visite.property?.title ?? null, visite.status === 'scheduled' ? t('aConfirmer') : null].filter(Boolean).join(' · ');
  const icone = visite.milestone === 'cancelled' ? CalendarX : visite.milestone === 'confirmed' ? CalendarCheck : CalendarClock;
  const ton = visite.milestone === 'confirmed' ? 'succes' : visite.milestone === 'created' ? 'attention' : 'neutre';
  // 6a — le lien vers la visite : chaque visite du fil est une de celles que l'API rend lisibles à ce
  // lecteur (`VisitesLisibles`, la règle même de `PropertyVisitPolicy::view`), donc qu'il peut ouvrir.
  return (
    <LigneDuFil
      icone={icone}
      ton={ton}
      titre={
        <Link href={`/app/visits/${visite.id}`} className="font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
          {libelle}
        </Link>
      }
      date={date(visite.at)}
      dernier={dernier}
    >
      {detail ? <p className="text-ui text-muted-foreground">{detail}</p> : null}
    </LigneDuFil>
  );
}

const CANAUX = ['call', 'whatsapp', 'email', 'sms'] as const;
type Canal = (typeof CANAUX)[number];
const ICONE_DU_CANAL: Record<Canal, LucideIcon | typeof IconeWhatsApp> = { call: PhoneOutgoing, whatsapp: IconeWhatsApp, email: Mail, sms: MessageSquare };

function Entree({ entree, dernier }: { readonly entree: EntreeDuFil; readonly dernier: boolean }) {
  const t = useTranslations('crm.fiche.fil');
  const tStage = useTranslations('crm.pipeline.stage');
  const tChamps = useTranslations('agentCrm.activity.fields');
  const date = useDateDeLigne();
  switch (entree.type) {
    case 'note':
      return <EntreeNote note={entree} dernier={dernier} />;
    case 'visit':
      return <EntreeVisite visite={entree} dernier={dernier} />;
    case 'contact': {
      const canal = (CANAUX as readonly string[]).includes(entree.channel ?? '') ? (entree.channel as Canal) : null;
      const titre = canal ? t(`contact.${entree.on === 'lead' ? 'demande' : 'fiche'}.${canal}`) : t('contact.inconnu');
      return <LigneDuFil icone={canal ? ICONE_DU_CANAL[canal] : PhoneOutgoing} ton={canal === 'whatsapp' ? 'whatsapp' : 'neutre'} titre={titre} date={date(entree.at, entree.causer?.name)} dernier={dernier} />;
    }
    case 'stage': {
      const etape = (s: string | null) => (s && tStage.has(s) ? tStage(s) : null);
      const de = etape(entree.from);
      const a = etape(entree.to) ?? '';
      return <LigneDuFil icone={TrendingUp} titre={de ? t('etape', { de, a }) : t('etapeSansOrigine', { a })} date={date(entree.at, entree.causer?.name)} dernier={dernier} />;
    }
    case 'record': {
      // Les noms des champs du journal (`agentCrm.activity.fields`) ; un champ inconnu se tait.
      const champs = entree.fields.map((c) => (tChamps.has(c) ? tChamps(c) : null)).filter((c): c is string => c !== null);
      const titre = entree.milestone === 'created' ? t('fiche.creee') : champs.length ? t('fiche.modifiee', { champs: champs.join(', ') }) : t('fiche.modifieeSansChamp');
      return <LigneDuFil icone={entree.milestone === 'created' ? UserPlus : UserPen} titre={titre} date={date(entree.at, entree.causer?.name)} dernier={dernier} />;
    }
    case 'task': {
      const titreDeLaTache = entree.task?.title ?? null;
      const faite = entree.milestone === 'done';
      const titre = titreDeLaTache ? t(faite ? 'tache.faite' : 'tache.creee', { titre: titreDeLaTache }) : t(faite ? 'tache.faiteSansTitre' : 'tache.creeeSansTitre');
      return <LigneDuFil icone={faite ? CircleCheck : ListChecks} ton={faite ? 'succes' : 'neutre'} titre={titre} date={date(entree.at, entree.causer?.name)} dernier={dernier} />;
    }
  }
}

/** La saisie en tête du fil : une note (épinglée ou non) ou une tâche. Au téléphone, ouverte par la barre du bas. */
function SaisieDuFil({ customer, demande }: { readonly customer: CustomerDetail; readonly demande: DemandeDeSaisie | null }) {
  const t = useTranslations('crm.fiche.fil.saisie');
  const { token } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const messageErreur = useMessageErreurApi();
  const [mode, setMode] = useState<Mode>('note');
  const [texte, setTexte] = useState('');
  // TCK-868 — le champ refusé est relié à son message (`aria-describedby`).
  const idDuMessage = useId();
  const [epingler, setEpingler] = useState(false);
  const [vide, setVide] = useState(false);
  const champ = useRef<HTMLTextAreaElement>(null);
  const prenom = customer.first_name?.trim() || null;

  // La barre du bas ouvre la saisie au téléphone, dans le mode touché (ajusté au rendu : chaque
  // toucher porte un jeton neuf), puis l'effet y porte le curseur.
  const [ouverteAuTelephone, setOuverteAuTelephone] = useState(false);
  const [jetonVu, setJetonVu] = useState<number | null>(null);
  if (demande && demande.jeton !== jetonVu) {
    setJetonVu(demande.jeton);
    setMode(demande.mode);
    setOuverteAuTelephone(true);
  }
  useEffect(() => {
    if (!demande) return;
    champ.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    champ.current?.focus({ preventScroll: true });
  }, [demande]);

  const envoi = useMutation({
    mutationFn: async ({ m, corps, epinglee }: { readonly m: Mode; readonly corps: string; readonly epinglee: boolean }) => {
      if (m === 'tache') await createCustomerTask(token ?? '', customer.id, { title: corps });
      else await createCustomerNote(token ?? '', customer.id, corps, epinglee);
      return m;
    },
    onSuccess: (m, { epinglee }) => {
      setTexte('');
      setEpingler(false);
      // Le journal du tiroir du pipeline compte notes et tâches (TCK-2093) : il se relit aussi.
      void queryClient.invalidateQueries({ queryKey: AGENT_CRM_QUERY_KEY.activity(customer.id) });
      // La tâche créée entre au fil (d1 a) : il se relit dans les deux modes.
      void queryClient.invalidateQueries({ queryKey: FIL_QUERY_KEY.tout(customer.id) });
      if (m === 'tache') {
        void queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY.customerTasks(customer.id) });
      } else {
        void queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY.customerNotes(customer.id) });
        // Les épinglées sont lues par la page : elle se relit.
        if (epinglee) router.refresh();
      }
    },
  });

  const envoyer = () => {
    // 3a — un double toucher n'envoie qu'une fois : l'envoi en cours bloque le suivant.
    if (envoi.isPending) return;
    const corps = texte.trim();
    if (!corps) {
      setVide(true);
      return;
    }
    setVide(false);
    envoi.mutate({ m: mode, corps, epinglee: mode === 'note' && epingler });
  };

  const PUCE = 'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-ui md:h-7 md:px-2.5 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring';
  const placeholder = mode === 'tache' ? (prenom ? t('placeholderTache', { prenom }) : t('placeholderTacheSansNom')) : prenom ? t('placeholder', { prenom }) : t('placeholderSansNom');

  return (
    <form
      data-slot="saisie-du-fil"
      className={cn('rounded-xl border border-border bg-background p-3', !ouverteAuTelephone && 'max-md:hidden')}
      onSubmit={(e) => {
        e.preventDefault();
        envoyer();
      }}
    >
      <Textarea
        ref={champ}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        maxLength={mode === 'tache' ? 255 : 5000}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-invalid={vide || envoi.isError || undefined}
        aria-describedby={vide || envoi.isError ? idDuMessage : undefined}
        // Maquette a-1 : une ligne au repos (24 px), qui grandit avec le texte (`field-sizing-content` de la primitive).
        className="min-h-0 resize-none border-0 bg-transparent px-0 py-1 shadow-none focus-visible:ring-0"
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={mode === 'note'} onClick={() => setMode('note')} className={cn(PUCE, mode === 'note' ? 'bg-foreground text-background' : 'bg-muted text-encre-douce')}>
          <NotebookPen className="size-3.5" aria-hidden="true" />
          {t('note')}
        </button>
        <button type="button" aria-pressed={mode === 'tache'} onClick={() => setMode('tache')} className={cn(PUCE, mode === 'tache' ? 'bg-foreground text-background' : 'bg-muted text-encre-douce')}>
          <ListChecks className="size-3.5" aria-hidden="true" />
          {t('tache')}
        </button>
        {mode === 'note' ? (
          <button type="button" aria-pressed={epingler} onClick={() => setEpingler((v) => !v)} className={cn(PUCE, epingler ? 'bg-foreground text-background' : 'bg-muted text-encre-douce')}>
            <Pin className="size-3.5" aria-hidden="true" />
            {t('epingler')}
          </button>
        ) : null}
        <Button type="submit" size="sm" className="ml-auto" disabled={envoi.isPending}>
          {envoi.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('ajouter')}
        </Button>
      </div>
      {vide ? (
        <p id={idDuMessage} role="alert" className="mt-2 text-ui text-destructive">
          {mode === 'tache' ? t('videTache') : t('vide')}
        </p>
      ) : envoi.isError ? (
        <p id={idDuMessage} role="alert" className="mt-2 text-ui text-destructive">
          {messageErreur(envoi.error, envoi.variables?.m === 'tache' ? t('tacheRefusee') : t('noteRefusee'))}
        </p>
      ) : null}
    </form>
  );
}

/** Les puces du filtre, dans l'URL. */
function FiltresDuFil({ actif }: { readonly actif: CleDeFiltre }) {
  const t = useTranslations('crm.fiche.fil.filtres');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div role="group" aria-label={t('aria')} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
      {FILTRES_DU_FIL.map((f) => (
        <button
          key={f.cle}
          type="button"
          aria-pressed={f.cle === actif}
          onClick={() => router.replace(`${pathname}${requeteAvecFiltre(params.toString(), f.cle)}`, { scroll: false })}
          className={cn(
            'inline-flex h-8 flex-none items-center rounded-full px-3 text-ui font-medium outline-none md:h-7 md:px-2.5 focus-visible:ring-3 focus-visible:ring-ring',
            f.cle === actif ? 'bg-foreground text-background' : 'bg-muted text-encre-douce',
          )}
        >
          {t(f.cle)}
        </button>
      ))}
    </div>
  );
}

/** 2b — les notes épinglées, en tête du fil (lues avec toutes les notes, par la page). */
function EpingleesDuFil({ notes }: { readonly notes: readonly CustomerNote[] }) {
  const t = useTranslations('crm.fiche.fil');
  const epinglees = notes.filter((n) => n.pinned);
  if (epinglees.length === 0) return null;
  return (
    <section data-slot="epinglees-du-fil" aria-label={t('epinglees')} className="rounded-xl bg-secondary/50 p-3">
      <SurtitreDeLaFiche className="mb-2">
        <Pin className="mr-1 inline size-3.5" aria-hidden="true" />
        {t('epinglees')}
      </SurtitreDeLaFiche>
      <ol>
        {epinglees.map((n, i) => (
          <EntreeNote
            key={`epinglee-${n.id}`}
            epinglee
            dernier={i === epinglees.length - 1}
            note={{ type: 'note', id: n.id, at: n.created_at, kind: n.kind ?? null, body: n.body, pinned: true, property_visit_id: null, author: n.author_name ? { id: n.author_id ?? 0, name: n.author_name } : null }}
          />
        ))}
      </ol>
    </section>
  );
}

export function FilDuClient({
  customer,
  notes,
  demandeDeSaisie,
}: {
  readonly customer: CustomerDetail;
  readonly notes: readonly CustomerNote[];
  readonly demandeDeSaisie: DemandeDeSaisie | null;
}) {
  const t = useTranslations('crm.fiche.fil');
  const { token } = useAuth();
  const params = useSearchParams();
  const filtre = filtreDeLURL(params.get(PARAMETRE_DU_FILTRE));
  const types = typesDuFiltre(filtre);
  const fil = useInfiniteQuery({
    queryKey: FIL_QUERY_KEY.filtre(customer.id, types),
    queryFn: ({ pageParam }) => fetchCustomerTimeline(token ?? '', customer.id, { types, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: pageSuivante,
    enabled: !!token,
  });
  const entrees = entreesDesPages(fil.data?.pages);

  let corps: ReactNode;
  if (fil.isPending) {
    corps = (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <span className="size-8 flex-none animate-pulse rounded-full bg-muted" />
            <span className="mt-1 h-4 flex-1 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  } else if (fil.isError) {
    corps = <ErrorState message={t('erreur')} onRetry={() => void fil.refetch()} retryLabel={t('reessayer')} />;
  } else if (entrees.length === 0) {
    corps = <p className="text-corps text-muted-foreground">{filtre === 'tout' ? t('vide') : t('videFiltre')}</p>;
  } else {
    corps = (
      <>
        <ol data-slot="entrees-du-fil">
          {entrees.map((e, i) => (
            <Entree key={`${e.type}-${e.id}-${e.type === 'visit' ? e.milestone : ''}`} entree={e} dernier={i === entrees.length - 1 && !fil.hasNextPage} />
          ))}
        </ol>
        {fil.hasNextPage ? (
          <Button type="button" variant="outline" className="mt-4 w-full" disabled={fil.isFetchingNextPage} onClick={() => void fil.fetchNextPage()}>
            {fil.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t('voirPlus')}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <section data-slot="fil-de-la-fiche" aria-labelledby="titre-du-fil" className="md:rounded-xl md:border md:border-border md:bg-card">
      <div className="md:border-b md:border-border md:p-4">
        <SaisieDuFil customer={customer} demande={demandeDeSaisie} />
      </div>
      <div className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:border-b md:border-border md:px-4 md:py-3">
        <h2 id="titre-du-fil" className="flex-none text-legende font-semibold tracking-surtitre text-muted-foreground uppercase">
          {t('titre')}
        </h2>
        <div className="md:ml-auto">
          <FiltresDuFil actif={filtre} />
        </div>
      </div>
      <div className="flex flex-col gap-4 pt-4 md:p-5">
        {filtre === 'tout' || filtre === 'notes' ? <EpingleesDuFil notes={notes} /> : null}
        {corps}
      </div>
    </section>
  );
}
