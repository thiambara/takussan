'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleAlert, Clock, Inbox, RotateCw } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { requeteAvec, useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { borneDuRetard, prenomDuDemandeur } from '@/lib/demandes/boite';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  type ContactLead,
  type FiltreDesDemandes,
  useBienDeLaDemande,
  useCompteDeLaVue,
  useContactLead,
  useContactLeads,
  useDelaisDeReponse,
  useDemandesEnRetard,
  useUnhandledLeadsCount,
} from '@/lib/queries/contact-leads';
import { isAdmin } from '@/lib/roles';
import { cn } from '@/lib/utils';

import { BandeauDesDelais } from './boite/BandeauDesDelais';
import { DemandeOuverte } from './boite/DemandeOuverte';
import { FiltresDuBureau, VuesDuBureau, type VueDeLaBoite } from './boite/FiltresDuBureau';
import { LigneDeDemande } from './boite/LigneDeDemande';
import { useNomDeLaDemande } from './boite/pieces';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { BarreDeRetour, useRetourDeContact } from './boite/RetourDeContact';
import { affinageDesDemandes, FILTRES_DES_DEMANDES, filtreDesDemandes, identifiantDeLUrl } from './filtre-des-demandes';

/** Les vues « à traiter » : l'ordre des plus anciennes, l'âge en rouge, le compte en pied de liste. */
const VUES_A_TRAITER: readonly FiltreDesDemandes[] = ['todo', 'unassigned', 'mine'];

/**
 * TCK-2584 — la boîte « Demandes », une boîte de réception (maquette `app-demandes` a, et la boîte du
 * bureau de `app-fil-commercial` a) :
 *
 *  · au téléphone, des lignes compactes à trois gestes (WhatsApp · Appeler · Visite ▸) ; la demande
 *    s'ouvre en plein écran (`?ouverte=`), « ✕ » y revient ;
 *  · dès `lg`, deux panneaux — la liste à gauche, la demande ouverte à droite ;
 *  · le geste de contact est ENREGISTRÉ au toucher, et au retour la barre « Vous avez répondu ? »
 *    (décision 3b) ; « Visite ▸ » ouvre la planification (TCK-2586) préremplie de la demande ;
 *  · l'administrateur voit au bureau le délai de première réponse (TCK-2583).
 *
 * L'URL porte la vue (`?filtre=`), la recherche (`?q=`), les filtres du bureau (`?bien=`, `?agent=`,
 * `?canal=`), la demande désignée par une notification (`?lead=`, en tête et encadrée) et la demande
 * ouverte (`?ouverte=`). Désignée et ouverte sont deux clés : ouvrir une ligne ne la fait pas sauter
 * en tête sous le doigt.
 */
export function ContactLeadsInbox() {
  const t = useTranslations('contactLeads');
  const f = useFormatteurs();
  const router = useRouter();
  const { params, remplacer } = useVueDansLUrl();
  const filtre = filtreDesDemandes(params);
  const affinage = affinageDesDemandes(params);
  const cleDeVue = JSON.stringify([filtre, affinage]);
  // La page appartient à la vue qui l'a choisie : une vue qui change, par la puce COMME par l'URL (la
  // pastille « À traiter » du menu change `?filtre=` sans démonter la page), ramène à la page 1.
  // Remise à zéro PENDANT le rendu (patron React « état ajusté sur un changement de prop »).
  const [pageChoisie, setPageChoisie] = useState({ cle: cleDeVue, page: 1 });
  if (pageChoisie.cle !== cleDeVue) setPageChoisie({ cle: cleDeVue, page: 1 });
  const page = pageChoisie.cle === cleDeVue ? pageChoisie.page : 1;
  const setPage = (suivante: number) => setPageChoisie({ cle: cleDeVue, page: suivante });

  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const large = useMatchesMedia('(width >= 64rem)');
  const maintenant = useMinuteCourante();
  const nomDe = useNomDeLaDemande();
  const query = useContactLeads(filtre, page, affinage);
  // P97.04 (TCK-1120) — la cible `lead` : la demande désignée, en tête, quelle que soit la vue.
  const designee = useContactLead(identifiantDeLUrl(params.get('lead')));
  const enTete = designee.isError ? null : (designee.data?.data ?? null);
  const idOuverte = identifiantDeLUrl(params.get('ouverte'));

  // « Non attribuées » : au seul personnel qui attribue (P152.05 : la capacité, pas le rôle).
  const { can: peutAttribuer } = useCan('crm.assign', user?.agency_id ?? undefined, user !== null);
  const vues = FILTRES_DES_DEMANDES.filter((v) => v !== 'unassigned' || peutAttribuer);
  // Le compte « À traiter » est celui du menu (même clé, même requête : la pastille et la puce disent
  // le même nombre).
  const aTraiter = useUnhandledLeadsCount();
  const nonAttribuees = useCompteDeLaVue('unassigned', { enabled: peutAttribuer });
  const enRetard = useDemandesEnRetard(borneDuRetard(maintenant));
  // Le bandeau des délais : à l'administrateur, au bureau. L'API l'ouvre à `crm.view_all`, que
  // l'agent porte aussi — la décision de le montrer est le rôle.
  const admin = isAdmin(roles);
  const delais = useDelaisDeReponse({ enabled: admin && large });

  const retour = useRetourDeContact();
  const [aPlanifier, setAPlanifier] = useState<ContactLead | null>(null);

  const total = query.data?.meta.total ?? null;
  const compteATraiter = aTraiter.data?.meta.total ?? null;
  const compteEnRetard = enRetard.data?.meta.total ?? null;
  const compteNonAttribuees = nonAttribuees.data?.meta.total ?? null;
  const page_ = query.data?.data ?? [];
  const lignes = enTete ? [enTete, ...page_.filter((l) => l.id !== enTete.id)] : page_;
  const ouverteDansLaListe = idOuverte !== null ? (lignes.find((l) => l.id === idOuverte) ?? null) : null;
  const ouverteLue = useContactLead(idOuverte !== null && ouverteDansLaListe === null ? idOuverte : null);
  // Au bureau, sans `?ouverte=`, la première ligne est ouverte : le panneau de droite n'est jamais vide.
  const ouverte = ouverteDansLaListe ?? ouverteLue.data?.data ?? (large ? (lignes[0] ?? null) : null);

  const messageWhatsApp = (lead: ContactLead) => {
    const nom = prenomDuDemandeur(lead.name) ?? nomDe(lead);
    return lead.property ? t('whatsappReplyProperty', { name: nom, title: lead.property.title }) : t('whatsappReply', { name: nom });
  };
  const gestes = (lead: ContactLead) => ({
    lead,
    nom: nomDe(lead),
    messageWhatsApp: messageWhatsApp(lead),
    onContact: retour.signaler,
    onVisite: setAPlanifier,
  });

  // Ouvrir : au téléphone une entrée d'historique (le retour arrière ferme la demande) ; au bureau,
  // un remplacement (cliquer dix lignes n'empile pas dix retours).
  const ouvrir = (lead: ContactLead) => {
    if (large) remplacer({ ouverte: lead.id });
    else router.push(requeteAvec(params, { ouverte: lead.id }), { scroll: true });
  };
  const choisirVue = (v: FiltreDesDemandes) => remplacer({ filtre: v === 'todo' ? null : v, ouverte: null });

  const sousTitre = (() => {
    if (query.isLoading) return t('inbox.loading');
    const parties: string[] = [];
    if (compteATraiter !== null) parties.push(compteATraiter === 0 ? t('inbox.allDone') : t('inbox.todoCount', { count: compteATraiter }));
    if (admin && compteNonAttribuees) parties.push(t('inbox.unassignedCount', { count: compteNonAttribuees }));
    else if (compteEnRetard) parties.push(t('inbox.lateCount', { count: compteEnRetard }));
    const jour = f.date(maintenant, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Dakar' });
    parties.push(jour.charAt(0).toUpperCase() + jour.slice(1));
    return parties.join(' · ');
  })();

  const comptesDesVues: Partial<Record<FiltreDesDemandes, { compte: number | undefined; alerte?: boolean }>> = {
    todo: { compte: compteATraiter ?? undefined, alerte: Boolean(compteATraiter) },
    unassigned: { compte: compteNonAttribuees ?? undefined },
  };
  const vuesDuBureau: VueDeLaBoite[] = vues.map((v) => ({ filtre: v, ...comptesDesVues[v] }));

  const planification = aPlanifier ? <PlanifierDepuisLaDemande lead={aPlanifier} nom={nomDe(aPlanifier)} onClose={() => setAPlanifier(null)} /> : null;

  // ── Téléphone : la demande ouverte remplace la liste. ─────────────────────────────────────────
  if (!large && ouverte) {
    // Le rang se lit dans la page SERVIE (`page_`), jamais dans `lignes` : la désignée y est préposée
    // à chaque page sans être comptée dans `meta.total` de la vue, ce qui décalait tous les rangs
    // (« 2 sur 2 à traiter » pour une seule à traiter, « 41 sur 40 » en page 2 — vérification adverse
    // de TCK-2584, d1).
    const rang = page_.findIndex((l) => l.id === ouverte.id);
    const rangLu = { n: (page - 1) * 20 + rang + 1, total: total ?? 0 };
    const depuisLaNotification = enTete?.id === ouverte.id;
    // Ouverte depuis une notification (`?lead=`, la demande désignée) : le sous-titre le dit, comme
    // l'écran « La demande » de la maquette (app-fil-commercial a-0) — sans rang quand elle n'est pas
    // de la page servie (traitée, d'une autre vue ou d'une autre page).
    const position =
      rang >= 0 && total !== null
        ? depuisLaNotification
          ? t('detail.fromNotification', rangLu)
          : VUES_A_TRAITER.includes(filtre)
            ? t('detail.position', rangLu)
            : t('detail.positionAll', rangLu)
        : depuisLaNotification
          ? t('detail.fromNotificationAlone')
          : undefined;
    return (
      <PagePleineLargeur data-slot="boite-des-demandes">
        <DemandeOuverte
          key={ouverte.id}
          {...gestes(ouverte)}
          maintenant={maintenant}
          regime="telephone"
          position={position}
          repli={`/app/leads${requeteAvec(params, { ouverte: null })}`}
          pied={
            retour.retour ? <BarreDeRetour retour={retour.retour} regime="telephone" maintenant={maintenant} onFermer={retour.fermer} /> : undefined
          }
        />
        {planification}
      </PagePleineLargeur>
    );
  }

  const rechercher = (
    <DebouncedSearchInput
      value={affinage.recherche ?? ''}
      onCommit={(q) => remplacer({ q: q.trim() || null, ouverte: null })}
      placeholder={t('desktop.search')}
      aria-label={t('desktop.search')}
      busy={query.isFetching}
      className="lg:w-64 lg:flex-none"
    />
  );

  const vide = (
    <EmptyState
      variant="nue"
      // Au bureau, centré dans le panneau : `lg:pt-12` le pose où `app-demandes` a-3 le dessine.
      className="pt-20 lg:pt-12"
      icon={<Inbox className="size-6" strokeWidth={1.75} aria-hidden="true" />}
      title={t(`empty.${filtre}`)}
      description={t('empty.description')}
      action={
        filtre !== 'handled' ? (
          <Button variant={large ? 'outline' : 'link'} onClick={() => choisirVue('handled')}>
            {t('empty.seeHandled')}
          </Button>
        ) : undefined
      }
    />
  );

  const erreur = (
    <EmptyState
      variant="nue"
      className="pt-20"
      role="alert"
      icon={<CircleAlert className="size-6 text-destructive" strokeWidth={1.75} aria-hidden="true" />}
      title={t('errorTitle')}
      description={t('errorBody')}
      action={
        // `app-demandes` a-5 : au bureau aussi, le bouton au pouce (44 px ×0,9, rayon 14 ×0,9, sans filet).
        <Button
          variant="sombre"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="lg:h-11 lg:gap-2 lg:rounded-xl lg:border-0 lg:px-5 lg:text-corps lg:font-semibold"
        >
          <RotateCw className="lg:size-5" strokeWidth={1.75} aria-hidden="true" />
          {t('retry')}
        </Button>
      }
    />
  );

  const chargement = (
    <div data-slot="squelettes" aria-hidden="true" className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2.5 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="h-4 w-2/5 animate-pulse rounded bg-muted" />
            <span className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
          <span className="block h-3 w-3/5 animate-pulse rounded bg-muted" />
          <span className="block h-3 w-4/5 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-3 gap-2 pt-1 lg:hidden">
            <span className="h-11 animate-pulse rounded-xl bg-muted" />
            <span className="h-11 animate-pulse rounded-xl bg-muted" />
            <span className="h-11 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );

  const etat: 'chargement' | 'erreur' | 'vide' | 'liste' = query.isLoading
    ? 'chargement'
    : query.isError || !query.data
      ? 'erreur'
      : lignes.length === 0
        ? 'vide'
        : 'liste';

  const liste = (
    <>
      <ul aria-label={t('inbox.listLabel')} className="border-t border-border lg:border-t-0">
        {lignes.map((lead) => (
          <LigneDeDemande
            key={lead.id}
            {...gestes(lead)}
            maintenant={maintenant}
            ouverte={large && ouverte?.id === lead.id}
            designee={enTete?.id === lead.id}
            onOuvrir={ouvrir}
          />
        ))}
      </ul>
      {query.data && query.data.meta.last_page > 1 ? (
        <div className="px-4 py-3">
          <Pagination page={page} lastPage={query.data.meta.last_page} onChange={setPage} />
        </div>
      ) : null}
      {VUES_A_TRAITER.includes(filtre) && total !== null ? (
        <p className="px-4 py-5 text-center text-ui text-muted-foreground lg:hidden">{t('inbox.listFooter', { count: total })}</p>
      ) : null}
    </>
  );

  const rendu: Record<typeof etat, ReactNode> = { chargement, erreur, vide, liste };

  return (
    <PagePleineLargeur data-slot="boite-des-demandes" className="flex flex-col">
      <DeclarerEnTete titre={t('shortTitle')} />
      <div className="max-md:hidden">
        <PageHeader
          title={t('title')}
          description={sousTitre}
          bandeau={admin && large && delais.data?.data ? <BandeauDesDelais delais={delais.data.data} /> : undefined}
          dessous={
            large ? (
              <div className="flex flex-wrap items-center gap-2 pb-4">
                <VuesDuBureau vues={vuesDuBureau} active={filtre} onChoisir={choisirVue} />
                <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                <FiltresDuBureau
                  affinage={affinage}
                  onAffiner={(c) => remplacer({ ...c, ouverte: null })}
                  agenceDesAgents={user?.agency_id && peutAttribuer ? user.agency_id : null}
                />
                <div className="ml-auto">{rechercher}</div>
              </div>
            ) : undefined
          }
        />
      </div>
      {large ? null : (
        <>
          <RangeeDePuces aria-label={t('filters.label')} className="border-b border-border bg-background md:mt-5 md:px-0">
            {vues.map((v) => (
              <PuceDeFiltre key={v} active={v === filtre} compte={comptesDesVues[v]?.compte} onClick={() => choisirVue(v)}>
                {t(`filters.${v}`)}
              </PuceDeFiltre>
            ))}
          </RangeeDePuces>
          {/* `app-demandes` a-0 (téléphone) : l'en-tête ne porte que la loupe de la coque (« Aller à »),
              aucune action de page. Une recherche arrivée par l'URL (`?q=`) reste lisible et effaçable. */}
          {affinage.recherche ? <div className="border-b border-border px-4 py-2.5 md:px-0">{rechercher}</div> : null}
          {VUES_A_TRAITER.includes(filtre) && etat === 'liste' ? (
            <p className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground md:px-0">
              <Clock className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              {compteEnRetard ? `${t('inbox.oldestFirst')} · ${t('inbox.lateCount', { count: compteEnRetard })}` : t('inbox.oldestFirst')}
            </p>
          ) : null}
          {rendu[etat]}
          {/* `app-demandes` a-2 (téléphone) : de retour de WhatsApp ou d'un appel, la question se pose
              au-dessus de la barre d'onglets, sur la liste ; de 768 à 1023 aussi (`md:flex`). */}
          {retour.retour ? (
            <BarreDAction className="md:flex">
              <BarreDeRetour retour={retour.retour} regime="telephone" maintenant={maintenant} onFermer={retour.fermer} />
            </BarreDAction>
          ) : null}
        </>
      )}
      {large ? (
        <PanneauxDuBureau>
          <div
            className={cn(
              'w-[calc(var(--spacing)*83.33)] flex-none overflow-y-auto border-r border-border bg-card xl:w-[min(calc(var(--spacing)*116.67),calc(50%-var(--spacing)*45.56))]',
              etat !== 'liste' && etat !== 'chargement' && 'hidden',
            )}
          >
            {etat === 'chargement' ? chargement : liste}
          </div>
          {etat === 'liste' && ouverte ? (
            <DemandeOuverte
              key={ouverte.id}
              {...gestes(ouverte)}
              maintenant={maintenant}
              regime="bureau"
              pied={
                retour.retour ? <BarreDeRetour retour={retour.retour} regime="bureau" maintenant={maintenant} onFermer={retour.fermer} /> : undefined
              }
            />
          ) : etat === 'chargement' ? (
            <div className="flex-1 space-y-4 p-6" aria-hidden="true">
              <span className="block h-6 w-64 animate-pulse rounded bg-muted" />
              <span className="block h-24 w-full max-w-xl animate-pulse rounded-xl bg-muted" />
              <span className="block h-16 w-full max-w-xl animate-pulse rounded-xl bg-muted" />
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center justify-center bg-background">{rendu[etat]}</div>
          )}
        </PanneauxDuBureau>
      ) : null}
      {planification}
    </PagePleineLargeur>
  );
}

/**
 * Les deux panneaux du bureau, bord à bord de la zone de contenu (la marge de l'enveloppe annulée) et
 * jusqu'au bas de la fenêtre : chacun défile pour soi. La hauteur se mesure (le bandeau et le sous-titre
 * font varier ce qui précède).
 */
function PanneauxDuBureau({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [haut, setHaut] = useState<number | null>(null);
  useLayoutEffect(() => {
    const mesurer = () => {
      const el = ref.current;
      if (el) setHaut(Math.round(el.getBoundingClientRect().top + window.scrollY));
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, []);
  return (
    <div
      ref={ref}
      data-slot="panneaux-du-bureau"
      style={haut !== null ? { height: `calc(100dvh - ${haut}px)` } : undefined}
      className="-mx-8 -mb-8 flex min-h-96 border-t border-border"
    >
      {children}
    </div>
  );
}

/**
 * « Visite ▸ » : la planification de TCK-2586 préremplie de la demande — le demandeur (verrouillé),
 * son bien (relu pour sa vignette et son prix), `contact_lead_id` à l'envoi ; la fiche de la demande,
 * ou celle que la demande retrouve (« déjà client·e »), reçoit la visite. La feuille attend la lecture
 * du bien : elle prend son préremplissage à l'ouverture.
 */
function PlanifierDepuisLaDemande({ lead, nom, onClose }: { readonly lead: ContactLead; readonly nom: string; readonly onClose: () => void }) {
  const lu = useBienDeLaDemande(lead.property_id);
  const f = useFormatteurs();
  const t = useTranslations('contactLeads');
  if (lead.property_id !== null && lu.isPending) return null;
  const bien = lu.data?.data ?? null;
  const prix =
    bien && bien.price !== null && bien.price !== undefined && bien.price !== ''
      ? bien.contract_type === 'rent'
        ? t('detail.rentPrice', { price: f.montantCourt(Number(bien.price), bien.currency) })
        : f.montantCourt(Number(bien.price), bien.currency)
      : null;
  const property =
    lead.property_id !== null && (bien || lead.property)
      ? { id: lead.property_id, libelle: bien?.title ?? lead.property?.title ?? '', photo: bien?.main_photo_url ?? null, detail: prix }
      : undefined;
  const fiche = lead.customer_id ?? lead.known_customer?.id ?? null;
  return (
    <PlanifierDialog
      demande={{ id: lead.id, nom, prenom: prenomDuDemandeur(lead.name), telephone: lead.phone, ficheId: fiche }}
      property={property}
      onClose={onClose}
    />
  );
}
