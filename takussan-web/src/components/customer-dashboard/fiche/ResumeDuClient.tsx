'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronRight, Loader2, Search } from 'lucide-react';

import { isReachable, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { CitationDuMessage, Surtitre } from '@/components/leads/boite/pieces';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import {
  ANCRE_DES_BIENS,
  lecteurDuPersonnel,
  lendemainADakar,
  nombreDeCorrespondances,
  PARAMETRE_DE_SECTION,
  prochaineVisite,
  tacheSuivante,
  type ProchaineVisite,
} from '@/lib/crm/fiche-du-client';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { AGENT_CRM_QUERY_KEY, fetchMatchingProperties } from '@/lib/queries/agent-crm';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import { useEnregistrerContactClient } from '@/lib/queries/customer-gestures';
import { nomAffichable, prenomDe } from '@/lib/identite';
import { fetchCustomerTasks } from '@/lib/queries/pipeline';
import { useConfirmVisit } from '@/lib/queries/visits';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { jourEnClair } from '@/lib/visites/planification';
import { cn } from '@/lib/utils';
import type { CustomerDetail } from '@/types/customer';
import type { Task } from '@/types/pipeline';

/**
 * TCK-2589 — le RÉSUMÉ de la fiche client (maquette `app-clients-fiche` a, « Résumé + fil ») : la
 * prochaine action, sa recherche, son origine. Chaque bloc ne dit que ce que l'API a rendu à ce
 * lecteur : absent, il ne se montre pas (le bailleur auteur ne lit ni visites ni origine).
 */

/** Une carte du résumé. */
export function CarteDeLaFiche({ children, className, id }: { readonly children: ReactNode; readonly className?: string; readonly id?: string }) {
  return (
    <section id={id} className={cn('rounded-xl border border-border bg-card p-4', className)}>
      {children}
    </section>
  );
}

/** Le surtitre d'un bloc, avec son action à droite (« Modifier »). */
export function SurtitreDeLaFiche({ children, droite, className }: { readonly children: ReactNode; readonly droite?: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Surtitre className="mb-0 min-w-0 flex-1 truncate">{children}</Surtitre>
      {droite}
    </div>
  );
}

/** La case du jour : « JEU. » sur « 12 ». */
function CaseDuJour({ at }: { readonly at: string }) {
  const f = useFormatteurs();
  const jour = new Date(at);
  const court = new Intl.DateTimeFormat(f.locale, { weekday: 'short', timeZone: 'Africa/Dakar' }).format(jour);
  const numero = new Intl.DateTimeFormat(f.locale, { day: 'numeric', timeZone: 'Africa/Dakar' }).format(jour);
  return (
    <span
      aria-hidden="true"
      className="flex size-12 flex-none flex-col items-center justify-center rounded-lg bg-card leading-none text-primary-deep ring-1 ring-primary/20"
    >
      <span className="text-pastille font-semibold uppercase">{court}</span>
      <span className="font-display text-lg font-semibold tabular-nums">{numero}</span>
    </span>
  );
}

/**
 * « Confirmer » : seulement quand la visite le permet à ce lecteur (`upcoming_visits[].manage`, la
 * règle de `POST …/confirm`, servie avec la fiche — aucune lecture de la visite, ni de son visiteur)
 * et qu'elle a une heure fixée ; une demande par tranche se confirme sur sa page, où l'heure se
 * choisit. Le refus de l'API se dit, sous le bouton.
 */
function ConfirmerLaVisite({ visite }: { readonly visite: ProchaineVisite }) {
  const t = useTranslations('crm.fiche.prochaine');
  const router = useRouter();
  const messageErreur = useMessageErreurApi();
  const confirmer = useConfirmVisit(visite.id);
  if (!visite.gere || !visite.aConfirmer) return null;
  if (visite.aTranche) {
    return (
      <Link
        href={`/app/visits/${visite.id}`}
        className="inline-flex h-11 flex-none items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        {t('fixerLHeure')}
      </Link>
    );
  }
  return (
    <div className="flex flex-none flex-col items-end">
      <button
        type="button"
        disabled={confirmer.isPending}
        onClick={() => confirmer.mutate(undefined, { onSuccess: () => router.refresh() })}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
      >
        {confirmer.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {t('confirmer')}
      </button>
      {confirmer.isError ? (
        <p role="alert" className="mt-1 max-w-48 text-right text-ui text-destructive">
          {messageErreur(confirmer.error, t('confirmationRefusee'))}
        </p>
      ) : null}
    </div>
  );
}

/** La ligne d'une tâche, sous la visite ou seule. */
function LigneDeTache({ tache, separee }: { readonly tache: Pick<Task, 'title' | 'due_at'>; readonly separee: boolean }) {
  const t = useTranslations('crm.fiche.prochaine');
  const f = useFormatteurs();
  const jour = tache.due_at ? jourEnClair(jourADakar(new Date(tache.due_at)), f.locale) : null;
  return (
    <div className={cn('flex items-center gap-3', separee && 'mt-3 border-t border-primary/20 pt-3')}>
      <span className="inline-flex size-6 flex-none rounded-full border-2 border-primary/40 bg-card" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-corps leading-snug">
        {tache.title}
        {jour ? <span className="block text-ui text-muted-foreground">{t('tache', { jour })}</span> : null}
      </p>
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

/**
 * « Rappeler la visite » (maquette a-3, « la veille ») : un WhatsApp pré-rédigé au client, pour une
 * visite confirmée et un numéro joignable. Noté comme un geste WhatsApp pour le personnel, comme les
 * gestes de la tête (TCK-2583) ; le bailleur auteur ne lit pas les visites de la fiche.
 */
function RappelerLaVisite({ customer, visite, jour, heure }: { readonly customer: CustomerDetail; readonly visite: ProchaineVisite; readonly jour: string; readonly heure: string }) {
  const t = useTranslations('crm.fiche.prochaine');
  const tFiche = useTranslations('crm.fiche');
  const enregistrement = useEnregistrerContactClient();
  const phone = customer.phone;
  if (!visite.confirmee || !isReachable(phone)) return null;
  const nom = nomAffichable(customer);
  const prenom = prenomDe(customer) ?? nom;
  const message = visite.bien ? t('rappelMessage', { prenom, jour, heure, bien: visite.bien }) : t('rappelMessageSansBien', { prenom, jour, heure });
  return (
    <>
      <a
        href={whatsappHref(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (lecteurDuPersonnel(customer)) enregistrement.mutate({ id: customer.id, channel: 'whatsapp' });
        }}
        aria-label={t('rappelerAria', { nom })}
        data-slot="rappeler-la-visite"
        className="mt-3 flex h-11 w-full min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-card px-3.5 text-corps font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        <IconeWhatsApp className="size-icone flex-none text-success lg:size-icone" />
        {t('rappeler')}
      </a>
      {enregistrement.isError ? (
        <p role="alert" className="mt-2 text-ui text-destructive">
          {tFiche('gestesNonNotes')}
        </p>
      ) : null}
    </>
  );
}

/** « Prochaine action » : la prochaine visite (ou tâche), et la tâche ouverte qui la suit. */
export function ProchaineActionDuClient({ customer, className }: { readonly customer: CustomerDetail; readonly className?: string }) {
  const t = useTranslations('crm.fiche.prochaine');
  const f = useFormatteurs();
  const { token } = useAuth();
  const taches = useQuery({
    queryKey: PIPELINE_QUERY_KEY.customerTasks(customer.id),
    queryFn: () => fetchCustomerTasks(token ?? '', customer.id),
    enabled: !!token,
  });
  const maintenant = useMinuteCourante();
  const visite = prochaineVisite(customer);
  const action = customer.next_action ?? null;
  const suivante = tacheSuivante(customer, taches.data);

  let corps: ReactNode;
  if (visite) {
    const jourDeLaVisite = jourADakar(new Date(visite.at));
    const jour = jourEnClair(jourDeLaVisite, f.locale);
    const heure = f.heure(visite.at);
    // « demain » (maquette a-3) : le jour de Dakar de la visite est le lendemain de celui de maintenant.
    const demain = jourDeLaVisite === lendemainADakar(maintenant, jourADakar);
    corps = (
      <>
        <div className="mt-3 flex items-center gap-3">
          <CaseDuJour at={visite.at} />
          <div className="min-w-0 flex-1 leading-snug">
            <p className="text-corps font-semibold tabular-nums">{demain ? t('visiteDemain', { jour, heure }) : t('visite', { jour, heure })}</p>
            {visite.bien ? <p className="truncate text-sm text-encre-douce">{visite.bien}</p> : null}
            {visite.aConfirmer ? <p className="text-ui text-muted-foreground">{t('aConfirmer')}</p> : null}
            {visite.confirmee ? <p className="text-ui text-muted-foreground">{t('confirmee')}</p> : null}
          </div>
          {visite.aConfirmer ? <ConfirmerLaVisite visite={visite} /> : null}
        </div>
        <RappelerLaVisite customer={customer} visite={visite} jour={jour} heure={heure} />
      </>
    );
  } else if (action?.type === 'task') {
    corps = (
      <div className="mt-3">
        <LigneDeTache tache={{ title: action.label ?? t('tacheSansTitre'), due_at: action.at }} separee={false} />
      </div>
    );
  } else {
    corps = <p className="mt-2 text-corps text-muted-foreground">{t('rien')}</p>;
  }

  return (
    <section data-slot="prochaine-action" className={cn('rounded-xl border border-primary/35 bg-secondary/50 p-4', className)}>
      <Surtitre className="mb-0 text-primary-deep">{t('titre')}</Surtitre>
      {corps}
      {visite && suivante ? <LigneDeTache tache={suivante} separee /> : null}
    </section>
  );
}

/** « Studio » → « studio », mais « F2 » reste « F2 » (un sigle ne se met pas en minuscule). */
function enMinuscule(mot: string): string {
  return mot.length > 1 && mot.charAt(1) === mot.charAt(1).toLocaleLowerCase() && mot.charAt(1) !== mot.charAt(1).toLocaleUpperCase()
    ? mot.charAt(0).toLocaleLowerCase() + mot.slice(1)
    : mot;
}

/** « Location · studio, F2 » puis « Mermoz, Ouakam · ≤ 250 000 F » ; `null` sans recherche. */
function useLignesDeLaRecherche(customer: CustomerDetail): readonly [string | null, string | null] | null {
  const t = useTranslations('crm.fiche.cherche');
  const tTypes = useTranslations('nav.categories');
  const f = useFormatteurs();
  const types = (customer.seeking_property_types ?? []).map((x) => (tTypes.has(x) ? tTypes(x) : x));
  const nature = customer.seeking_contract_type === 'sale' ? t('achat') : customer.seeking_contract_type ? t('location') : null;
  const quoi = [nature, types.length ? types.map(enMinuscule).join(', ') : null]
    .filter(Boolean)
    .join(' · ');
  const lieux = (customer.seeking_neighborhoods?.length ? customer.seeking_neighborhoods : customer.seeking_cities) ?? [];
  const budget = customer.budget_max !== null && customer.budget_max !== undefined && customer.budget_max !== '' ? t('plafond', { montant: f.montantCourt(Number(customer.budget_max)) }) : null;
  const ou = [lieux.length ? lieux.join(', ') : null, budget].filter(Boolean).join(' · ');
  if (!quoi && !ou) return null;
  return [quoi || null, ou || null];
}

/**
 * « Sa recherche » : ce que le client cherche, et la rangée des biens qui y correspondent — le
 * nombre lu sur `meta.total` de la même requête que la section « Biens correspondants » ; inconnu,
 * la rangée reste, sans nombre.
 */
export function RechercheDuClient({ customer, droite, className }: { readonly customer: CustomerDetail; readonly droite?: ReactNode; readonly className?: string }) {
  const t = useTranslations('crm.fiche.cherche');
  const { token } = useAuth();
  const lignes = useLignesDeLaRecherche(customer);
  const correspondances = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.matchingProperties(customer.id),
    queryFn: () => fetchMatchingProperties(token ?? '', customer.id),
    // Sans recherche, ni rangée ni ligne de dossier : rien à compter.
    enabled: !!token && lignes !== null,
    retry: false,
  });
  const nombre = nombreDeCorrespondances(correspondances.data);
  const { remplacer } = useVueDansLUrl();

  return (
    <CarteDeLaFiche className={className}>
      <SurtitreDeLaFiche droite={droite}>{t('titre')}</SurtitreDeLaFiche>
      {lignes ? (
        <>
          {lignes[0] ? <p className="mt-2 text-corps font-medium leading-snug">{lignes[0]}</p> : null}
          {lignes[1] ? <p className={cn('text-corps leading-snug text-encre-douce', !lignes[0] && 'mt-2')}>{lignes[1]}</p> : null}
        </>
      ) : (
        <p className="mt-2 text-corps text-muted-foreground">{t('vide')}</p>
      )}
      {/* Lot D — la rangée ouvre la ligne « Biens correspondants » du dossier (`?section=biens`) et
          l'amène à l'écran ; sans recherche, la ligne n'existe pas, la rangée non plus. */}
      {lignes ? (
        <a
          href={`?${PARAMETRE_DE_SECTION}=biens`}
          data-slot="biens-correspondants"
          onClick={(e) => {
            e.preventDefault();
            remplacer({ [PARAMETRE_DE_SECTION]: 'biens' });
            requestAnimationFrame(() => document.getElementById(ANCRE_DES_BIENS)?.scrollIntoView?.({ block: 'start' }));
          }}
          className="mt-3 flex h-11 items-center gap-2 rounded-lg bg-muted/70 px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Search className="size-4 flex-none text-primary" aria-hidden="true" />
          {nombre === null ? t('correspondantsSansNombre') : t('correspondants', { count: nombre })}
          <ChevronRight className="ml-auto size-4 flex-none text-muted-foreground" aria-hidden="true" />
        </a>
      ) : null}
    </CarteDeLaFiche>
  );
}

/** « Origine » : la demande d'où vient la fiche, et son message cité — au seul personnel. */
export function OrigineDuClient({ customer, className }: { readonly customer: CustomerDetail; readonly className?: string }) {
  const t = useTranslations('crm.fiche.origine');
  const f = useFormatteurs();
  const o = customer.origin;
  if (!o) return null;
  const date = o.received_at ? f.date(o.received_at, { day: 'numeric', month: 'short', timeZone: 'Africa/Dakar' }) : null;
  return (
    <CarteDeLaFiche className={className}>
      <SurtitreDeLaFiche>{t('titre')}</SurtitreDeLaFiche>
      <p className="mt-2 text-sm text-encre-douce">
        {o.property && date
          ? t('demandeSur', { date, bien: o.property.title })
          : o.property
            ? t('demandeSurSansDate', { bien: o.property.title })
            : date
              ? t('demande', { date })
              : t('demandeSansDate')}
      </p>
      {o.message ? <CitationDuMessage message={o.message} className="mt-2.5" /> : null}
    </CarteDeLaFiche>
  );
}
