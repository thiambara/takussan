'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { CalendarPlus, ChevronDown, ChevronRight, ListTodo, Plus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { PageHeader } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { decalerJour } from '@/lib/jour-de-l-api';
import {
  borneDAttente,
  chronologieDuJour,
  echeanceDuReport,
  jourADakar,
  resumeDeLaSemaine,
  semaineDe,
  tachesDeLAgenda,
  tachesDuJour,
  tachesEnRetard,
  type Report,
} from '@/lib/journee/journee';
import { useCalendar } from '@/lib/queries/calendar';
import { useEnregistrerContact } from '@/lib/queries/contact-leads';
import { useCocherTache, useDemandesQuiAttendent, useRelancesACompter, useReporterTache, useTachesDeLaJournee, useVisitesDeLaSemaine } from '@/lib/queries/journee';
import { useVisitesDeLaVue } from '@/lib/queries/visits';
import { FUSEAU_DES_VISITES } from '@/lib/visites/heure-de-dakar';
import { cn } from '@/lib/utils';
import { ARegler, type GestesDeLaJournee } from './ARegler';
import { Chronologie } from './Chronologie';
import { JourneeLibre } from './JourneeLibre';
import { CIBLES_DES_CHIFFRES, MesChiffres, type ChiffresDeLAgent } from './MesChiffres';
import { BandeDeSemaine, Etiquette, NavJour, SemaineBureau, dateDuJour, useJourEnClair } from './pieces';

interface MaJourneeProps {
  readonly chiffres: ChiffresDeLAgent;
  /** Ce qui reste en tête quand il y en a (le bandeau des brouillons d'assistant). */
  readonly bandeau?: ReactNode;
}

const HEURE = 3_600_000;

/**
 * TCK-2596 — « Ma journée », l'accueil de l'agent (maquette `app-aujourdhui` a, ADR-0096) : la bande de
 * la semaine, « À régler » (comptes rendus à faire, demandes qui attendent depuis plus de 24 h,
 * tâches en retard), la chronologie du jour choisi, « Toutes les tâches », et ses chiffres en bas —
 * chacun un lien. Au téléphone une colonne ; au bureau, dès `xl`, la chronologie à gauche, « À
 * régler » et « Mes chiffres » à droite (400 px).
 */
export function MaJournee({ chiffres, bandeau }: MaJourneeProps) {
  const t = useTranslations('journee');
  const f = useFormatteurs();
  const jourEnClair = useJourEnClair();
  const messageErreur = useMessageErreurApi();
  const maintenant = useMinuteCourante();
  const aujourdhui = jourADakar(maintenant);
  const [choisi, setChoisi] = useState<string | null>(null);
  const jour = choisi ?? aujourdhui;
  const estAujourdhui = jour === aujourdhui;
  const semaine = semaineDe(jour);
  const [ajouter, setAjouter] = useState(false);
  const [planifier, setPlanifier] = useState<{ readonly heure?: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // La borne des demandes « qui attendent » à l'heure près : une clé neuve par minute relirait la boîte.
  const avant = borneDAttente(new Date(Math.floor(maintenant.getTime() / HEURE) * HEURE));
  const visites = useVisitesDeLaVue({ day: jour, mine: '1' }, 'scheduled_at', {}, 1, 50);
  const aClore = useVisitesDeLaVue({ to_close: '1', mine: '1' }, '-scheduled_at', {}, 1, 5);
  const taches = useTachesDeLaJournee();
  const demandes = useDemandesQuiAttendent(avant);
  // La bande compte les tâches de l'agenda, et les visites à la source de la chronologie (r1 de faf3f10da).
  const agenda = useCalendar({ start_date: semaine[0]!, end_date: semaine[6]!, mine: true, types: ['task'] });
  const visitesDeLaSemaine = useVisitesDeLaSemaine(semaine[0]!, semaine[6]!);
  const relances = useRelancesACompter();

  const cocher = useCocherTache();
  const reporter = useReporterTache();
  const contacter = useEnregistrerContact();
  const echec = (e: unknown) => setErreur(messageErreur(e));

  const gestes: GestesDeLaJournee = {
    onCocher: (tache, faite) => {
      setErreur(null);
      cocher.mutate({ id: tache.id, faite }, { onError: echec });
    },
    onReporter: (tache, report: Report) => {
      setErreur(null);
      reporter.mutate({ id: tache.id, echeance: echeanceDuReport(report, new Date()) }, { onError: echec });
    },
    // Le lien WhatsApp s'ouvre de lui-même ; le geste s’enregistre à côté (TCK-2583), sans le retenir ; un refus se dit comme les autres gestes.
    onContacter: (d) => contacter.mutate({ id: d.id, channel: 'whatsapp' }, { onError: echec }),
    enCours: cocher.isPending ? (cocher.variables?.id ?? null) : reporter.isPending ? (reporter.variables?.id ?? null) : null,
  };

  const lesTaches = taches.data?.data ?? [];
  const evenements = agenda.data?.data ?? [];
  const enRetard = tachesEnRetard(lesTaches, maintenant);
  const moments = chronologieDuJour(visites.data?.data ?? [], estAujourdhui ? tachesDuJour(lesTaches, jour) : tachesDeLAgenda(evenements, jour));
  const resume = resumeDeLaSemaine(evenements, visitesDeLaSemaine.data?.data ?? [], semaine);
  const totalAClore = aClore.data?.meta.total ?? aClore.data?.data.length ?? 0;
  const totalDemandes = demandes.data?.meta.total ?? demandes.data?.data.length ?? 0;
  const aRegler = totalAClore + totalDemandes + enRetard.length;
  const aRelancer = relances.data?.meta.total ?? null;
  const charge = !visites.isPending && !aClore.isPending && !taches.isPending && !demandes.isPending;
  const libre = estAujourdhui && charge && moments.length === 0 && aRegler === 0;
  const mois = f.date(dateDuJour(aujourdhui), { month: 'short', timeZone: FUSEAU_DES_VISITES });

  const nbVisites = moments.filter((m) => m.genre === 'visite').length;
  const nbTaches = moments.length - nbVisites;
  // « 2 visites · 3 tâches · 4 choses à régler » : un compte nul se tait ; rien du tout, « Journée libre ».
  const parties = [nbVisites > 0 ? t('semaine.visites', { n: nbVisites }) : null, nbTaches > 0 ? t('semaine.taches', { n: nbTaches }) : null, estAujourdhui && aRegler > 0 ? t('aRegler.compte', { n: aRegler }) : null].filter(Boolean);
  const sousTitre = libre || parties.length === 0 ? t('sousTitreLibre') : parties.join(' · ');

  const ouvrirPlanifier = (heure?: string) => setPlanifier(heure ? { heure } : {});

  const blocARegler =
    estAujourdhui && aRegler > 0 ? (
      <ARegler
        aClore={aClore.data?.data ?? []}
        demandes={demandes.data?.data ?? []}
        enRetard={enRetard}
        maintenant={maintenant}
        gestes={gestes}
        className="mt-3"
      />
    ) : null;

  const chronologie =
    visites.isError || taches.isError ? (
      <ErrorState
        message={t('erreur')}
        retryLabel={t('reessayer')}
        onRetry={() => {
          void visites.refetch();
          void taches.refetch();
        }}
      />
    ) : moments.length === 0 && !estAujourdhui ? (
      <p className="px-4 py-6 text-sm text-muted-foreground md:px-5">{t('chronologie.rienCeJour')}</p>
    ) : (
      <Chronologie moments={moments} maintenant={estAujourdhui ? maintenant : null} gestes={gestes} onPlanifier={ouvrirPlanifier} />
    );

  const lienToutesLesTaches = (
    <Link
      href={CIBLES_DES_CHIFFRES.taches}
      className="flex h-12 items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-corps outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring"
    >
      <span className="flex-1 font-medium">{t('toutesLesTaches')}</span>
      <span className="tabular-nums text-muted-foreground">{typeof chiffres.tasks_open === 'number' ? f.nombre(chiffres.tasks_open) : null}</span>
      <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
    </Link>
  );

  const alerte = erreur ? (
    <p role="alert" className="text-sm text-destructive max-md:px-4">
      {erreur}
    </p>
  ) : null;

  return (
    <PagePleineLargeur data-slot="ma-journee">
      <DeclarerEnTete
        forme="racine"
        titre={jourEnClair(jour)}
        action={<ActionDEnTete libelle={t('ajouter.libelle')} icone={<Plus className="size-5" aria-hidden />} onClick={() => setAjouter(true)} primaire />}
      />

      {bandeau ? <div className="empty:hidden max-md:px-4 max-md:pt-4">{bandeau}</div> : null}

      {/* ─── Le téléphone : une colonne ─── */}
      <div data-slot="journee-telephone" className="md:hidden">
        <BandeDeSemaine semaine={semaine} jour={jour} maintenant={maintenant} resume={resume} onChoisir={setChoisi} className="border-b border-border/70" />
        {alerte ? <div className="pt-3">{alerte}</div> : null}
        {libre ? (
          <>
            <JourneeLibre aRelancer={aRelancer} onPlanifier={() => ouvrirPlanifier()} className="px-4 pt-10" />
            <div className="px-4 pb-8 pt-7">
              <Etiquette>{t('chiffres.titre')}</Etiquette>
              <MesChiffres chiffres={chiffres} aRelancer={aRelancer} mois={mois} className="mt-3" />
            </div>
          </>
        ) : (
          <>
            {blocARegler ? (
              <section className="px-4 pt-5">
                <Etiquette compte={aRegler}>{t('aRegler.titre')}</Etiquette>
                {blocARegler}
              </section>
            ) : null}
            <section className="pt-7">
              <Etiquette className="px-4 pb-3" action={<Link href="/app/calendar">{t('chronologie.agenda')}</Link>}>
                {estAujourdhui ? t('chronologie.titre') : jourEnClair(jour)}
              </Etiquette>
              {chronologie}
            </section>
            <section className="border-t border-border px-4 pb-8 pt-5">
              {lienToutesLesTaches}
              <Etiquette className="mt-6">{t('chiffres.titre')}</Etiquette>
              <MesChiffres chiffres={chiffres} aRelancer={aRelancer} mois={mois} className="mt-3" />
            </section>
          </>
        )}
      </div>

      {/* ─── Le bureau ─── */}
      <div data-slot="journee-bureau" className="max-md:hidden">
        <PageHeader
          title={jourEnClair(jour)}
          description={sousTitre}
          actions={
            <>
              <NavJour onPrecedent={() => setChoisi(decalerJour(jour, -1))} onAujourdhui={() => setChoisi(null)} onSuivant={() => setChoisi(decalerJour(jour, 1))} />
              <MenuAjouter onPlanifier={() => ouvrirPlanifier()} />
            </>
          }
          dessous={<SemaineBureau semaine={semaine} jour={jour} resume={resume} onChoisir={setChoisi} />}
        />
        {alerte ? <div className="pt-4">{alerte}</div> : null}
        <div className="grid grid-cols-1 items-start gap-6 pt-6 xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*100)]">
          {libre ? (
            <div className="rounded-xl border border-border bg-card px-8 py-12">
              <JourneeLibre aRelancer={aRelancer} onPlanifier={() => ouvrirPlanifier()} className="mx-auto max-w-130" />
            </div>
          ) : (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                <h2 className="text-base font-semibold">{estAujourdhui ? t('chronologie.titre') : jourEnClair(jour)}</h2>
                <Link href="/app/calendar" className="ml-auto text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
                  {t('chronologie.ouvrirAgenda')}
                </Link>
              </div>
              <div className="pb-2 pt-4">{chronologie}</div>
            </section>
          )}
          <div className="space-y-6">
            {blocARegler && !libre ? (
              <div>
                <Etiquette compte={aRegler}>{t('aRegler.titre')}</Etiquette>
                {blocARegler}
              </div>
            ) : null}
            <div>
              <Etiquette action={<Link href="/app/reports">{t('chiffres.rapport')}</Link>}>{t('chiffres.titre')}</Etiquette>
              <MesChiffres chiffres={chiffres} aRelancer={aRelancer} mois={mois} sansPied className="mt-3" />
            </div>
          </div>
        </div>
      </div>

      {/* « + » de l'en-tête du téléphone : Visite, Tâche, Client. */}
      <FeuilleDuBas open={ajouter} onOpenChange={setAjouter} titre={t('ajouter.titre')}>
        <ChoixDAjout
          onPlanifier={() => {
            setAjouter(false);
            ouvrirPlanifier();
          }}
        />
      </FeuilleDuBas>
      {planifier ? <PlanifierDialog jour={jour} heure={planifier.heure} onClose={() => setPlanifier(null)} /> : null}
    </PagePleineLargeur>
  );
}

const CHOIX = 'flex min-h-14 w-full items-center gap-3 rounded-lg px-1 text-left text-corps font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';

function ChoixDAjout({ onPlanifier }: { readonly onPlanifier: () => void }) {
  const t = useTranslations('journee.ajouter');
  const icone = 'size-5 text-encre-douce';
  return (
    <ul className="divide-y divide-border pb-2">
      <li>
        <button type="button" onClick={onPlanifier} className={CHOIX}>
          <CalendarPlus className={icone} strokeWidth={1.75} aria-hidden="true" />
          {t('visite')}
        </button>
      </li>
      <li>
        <Link href="/app/tasks?nouvelle=1" className={CHOIX}>
          <ListTodo className={icone} strokeWidth={1.75} aria-hidden="true" />
          {t('tache')}
        </Link>
      </li>
      <li>
        <Link href="/app/customers/new" className={CHOIX}>
          <UserPlus className={icone} strokeWidth={1.75} aria-hidden="true" />
          {t('client')}
        </Link>
      </li>
    </ul>
  );
}

/** « Ajouter ▾ » du bureau : Visite, Tâche, Client. */
function MenuAjouter({ onPlanifier }: { readonly onPlanifier: () => void }) {
  const t = useTranslations('journee.ajouter');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className={cn('gap-1.5')} />}>
        <Plus className="size-4" aria-hidden="true" />
        {t('bouton')}
        <ChevronDown className="size-4 opacity-80" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onPlanifier}>{t('visite')}</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/app/tasks?nouvelle=1" />}>{t('tache')}</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/app/customers/new" />}>{t('client')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
