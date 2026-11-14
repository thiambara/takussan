'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContactsSurPlaceDuBien } from '@/components/contact/ContactsSurPlaceDuBien';
import { PropertyCollaboratorsPanel } from '@/components/property-dashboard/PropertyCollaboratorsPanel';
import { PropertyOverviewPanel } from '@/components/property-dashboard/PropertyOverviewPanel';
import { PropertyPriceHistoryList } from '@/components/property-dashboard/PropertyPriceHistoryList';
import { OngletLocation } from '@/components/property-dashboard/fiche/OngletLocation';
import { OngletDocuments, useDocumentsDuBien } from '@/components/property-dashboard/fiche/OngletDocuments';
import { BarreDuBien } from '@/components/property-dashboard/fiche/BarreDuBien';
import { MotifsHorsLigne } from '@/components/property-dashboard/fiche/MotifsHorsLigne';
import { phrasesDesMotifs } from '@/lib/biens/motifs-hors-ligne';
import { useMaintenanceHistoryForProperty } from '@/lib/queries/maintenance';
import type { PropertyDetail } from '@/types/property';
import type { Tag } from '@/types/tag';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

/**
 * TCK-1040 (P70.03) — le contenu des onglets autres que l'aperçu se charge à leur première
 * ouverture : `TabsContent` ne monte que l'onglet actif, et `next/dynamic` sort leur code du JS
 * initial de la fiche (l'assistant d'édition seul y pesait 58,9 Kio gzip). Garde :
 * `__tests__/PropertyDetailTabs.onglets-differes.test.ts`.
 */
const PropertyForm = dynamic(() => import('@/components/property-form/PropertyForm').then((m) => m.PropertyForm));
const PropertyMediaPanel = dynamic(() =>
  import('@/components/property-dashboard/PropertyMediaPanel').then((m) => m.PropertyMediaPanel),
);
const PropertyCalendarPanel = dynamic(() =>
  import('@/components/property-dashboard/PropertyCalendarPanel').then((m) => m.PropertyCalendarPanel),
);
// TCK-2009 (P171.08) — l'historique des interventions du bien (`docs/features.md` § 1.8) ; TCK-2639 :
// sous son propre onglet « Interventions », différé comme les autres.
const MaintenanceHistoryByProperty = dynamic(() =>
  import('@/components/maintenance/MaintenanceHistoryByProperty').then((m) => m.MaintenanceHistoryByProperty),
);

/**
 * TCK-2639 — des onglets par MÉTIER : « Location » (qui occupe, sous quel bail, le loyer du mois),
 * « Annonce » (ce qui sert la publication : l'aperçu, l'édition et les médias d'avant, en sections),
 * « Interventions (n) », « Documents (n) », « Historique » (des prix), et le calendrier d'un séjour
 * court. « Location » s'ouvre par défaut sur un bien à louer, « Annonce » sur un bien à vendre.
 */
export const ONGLETS_DU_BIEN = ['location', 'annonce', 'interventions', 'documents', 'historique', 'calendar'] as const;
export type OngletDuBien = (typeof ONGLETS_DU_BIEN)[number];
export const SECTIONS_DE_L_ANNONCE = ['apercu', 'edit', 'media'] as const;
export type SectionDeLAnnonce = (typeof SECTIONS_DE_L_ANNONCE)[number];

interface Position {
  readonly onglet: OngletDuBien;
  readonly section: SectionDeLAnnonce;
}

/**
 * L'onglet d'une URL. Les anciennes valeurs (`overview`, `edit`, `media`, `history`) gardent leur
 * destination : un lien déjà envoyé ou un favori ne retombe pas sur un autre contenu.
 */
export function positionDeLUrl(tab: string | null, section: string | null, parDefaut: OngletDuBien, avecCalendrier: boolean): Position {
  const sectionLue: SectionDeLAnnonce = (SECTIONS_DE_L_ANNONCE as readonly string[]).includes(section ?? '') ? (section as SectionDeLAnnonce) : 'apercu';
  switch (tab) {
    case 'overview':
      return { onglet: 'annonce', section: 'apercu' };
    case 'edit':
    case 'media':
      return { onglet: 'annonce', section: tab };
    case 'history':
      return { onglet: 'historique', section: 'apercu' };
    case 'calendar':
      return { onglet: avecCalendrier ? 'calendar' : parDefaut, section: 'apercu' };
    default:
      return (ONGLETS_DU_BIEN as readonly string[]).includes(tab ?? '')
        ? { onglet: tab as OngletDuBien, section: sectionLue }
        : { onglet: parDefaut, section: 'apercu' };
  }
}

interface Props {
  readonly property: PropertyDetail;
  readonly tags: Tag[];
  /** Le personnel de l'agence : « Encaisser », « Relancer » et les gestes réservés lui reviennent. */
  readonly personnel?: boolean;
  /** L'admin de l'agence : le nom du bailleur mène à sa fiche (`/app/owners/{id}`, TCK-2641). */
  readonly lienVersLeBailleur?: boolean;
}

/** Le compteur d'un onglet : le nombre de ce que l'onglet montre, rien tant qu'il n'est pas lu. */
function Compte({ n }: { readonly n: number | null | undefined }) {
  if (n === null || n === undefined) return null;
  return <span className="ml-1 text-xs font-semibold tabular-nums text-muted-foreground">{n}</span>;
}

export function PropertyDetailTabs({ property, tags, personnel = false, lienVersLeBailleur = false }: Props) {
  const t = useTranslations('propertyDashboard.tabs');
  const tIdentite = useTranslations('propertyDashboard.fiche.identite');
  const tMotif = useTranslations('propertyDashboard.horsLigne');
  // TCK-2678 (AC4, 2026-11-14) — les motifs que l'API a jugés, jamais recomposés du statut ni de la visibilité.
  const motifs = property.is_online === false ? phrasesDesMotifs(property.offline_reasons ?? [], (cle) => tMotif(cle)) : [];
  const searchParams = useSearchParams();
  // TCK-596 §3B — le calendrier d'hôte n'a de sens que pour un séjour court (nuit ou semaine).
  const hasCalendar =
    property.contract_type === 'rent' &&
    (property.rent_period === 'daily' || property.rent_period === 'weekly');
  const parDefaut: OngletDuBien = property.contract_type === 'rent' ? 'location' : 'annonce';
  // TCK-316 — l'onglet suit l'URL sans aller-retour serveur, et SANS effet : `useStateSyncedWith`
  // ne resynchronise que lorsque la valeur externe CHANGE, donc un clic (qui écrit l'URL par
  // `replaceState`, sans notifier le routeur) n'est pas écrasé au rendu suivant.
  // La position se synchronise par sa CLÉ (`onglet:section`) : `useStateSyncedWith` compare par
  // `Object.is`, et un objet neuf à chaque rendu resynchroniserait sans fin.
  const depuisLUrl = positionDeLUrl(searchParams.get('tab'), searchParams.get('section'), parDefaut, hasCalendar);
  const [cle, setCle] = useStateSyncedWith<string>(`${depuisLUrl.onglet}:${depuisLUrl.section}`);
  const [ongletCourant, sectionCourante] = cle.split(':') as [OngletDuBien, SectionDeLAnnonce];
  const position: Position = { onglet: ongletCourant, section: sectionCourante };
  const setPosition = (suivante: Position) => setCle(`${suivante.onglet}:${suivante.section}`);

  // Pas de `useCallback` : le React Compiler mémoïse (ADR-0015).
  const aller = (suivante: Position) => {
    setPosition(suivante);
    const params = new URLSearchParams(window.location.search);
    if (suivante.onglet === parDefaut) params.delete('tab');
    else params.set('tab', suivante.onglet);
    if (suivante.onglet === 'annonce' && suivante.section !== 'apercu') params.set('section', suivante.section);
    else params.delete('section');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };
  // L'aperçu renvoie vers l'édition, les médias ou l'historique : ses cibles d'avant TCK-2639.
  const sauter = (cible: 'overview' | 'edit' | 'media' | 'history') => aller(positionDeLUrl(cible, null, parDefaut, hasCalendar));

  const priceHistory = property.price_history ?? [];
  // AC4 — chaque compteur lit la requête même que rend son onglet : la première page des
  // interventions (son `meta.total`), les documents tels que la liste les montre.
  const interventions = useMaintenanceHistoryForProperty(property.id, { page: 1 });
  const documents = useDocumentsDuBien(property);

  const section = (cle: SectionDeLAnnonce, libelle: ReactNode) => (
    <button
      type="button"
      aria-pressed={position.section === cle}
      onClick={() => aller({ onglet: 'annonce', section: cle })}
      className={cn(
        'h-controle rounded-full px-3 text-ui font-medium transition-colors',
        position.section === cle ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      {libelle}
    </button>
  );

  return (
    <Tabs
      value={position.onglet}
      onValueChange={(value) => {
        if (typeof value === 'string' && (ONGLETS_DU_BIEN as readonly string[]).includes(value)) {
          aller({ onglet: value as OngletDuBien, section: 'apercu' });
        }
      }}
      // `gap` et non `space-y` : la racine des onglets est déjà en `flex gap-2`, les deux s'additionnaient.
      className="gap-4 lg:gap-5"
    >
      {/* Collants au téléphone, sous l'en-tête de la coque ; la liste défile dans sa boîte. */}
      <div className="sticky top-0 z-10 -mx-4 bg-background px-4 pt-2 md:static md:mx-0 md:px-0 md:pt-0" data-slot="onglets-du-bien">
        {/* `flex` : la liste (inline-flex) n'ouvre pas de ligne de texte, dont l'interligne la décalait de 2 px. */}
        <div className="flex overflow-x-auto">
          <TabsList variant="line" aria-label={t('label')}>
            <TabsTrigger value="location">{t('location')}</TabsTrigger>
            <TabsTrigger value="annonce">{t('annonce')}</TabsTrigger>
            <TabsTrigger value="interventions">
              {t('interventions')}
              <Compte n={interventions.data?.meta.total} />
            </TabsTrigger>
            <TabsTrigger value="documents">
              {t('documents')}
              <Compte n={documents.total} />
            </TabsTrigger>
            <TabsTrigger value="historique">
              {t('historique')}
              <Compte n={priceHistory.length > 0 ? priceHistory.length : null} />
            </TabsTrigger>
            {hasCalendar && <TabsTrigger value="calendar">{t('calendar')}</TabsTrigger>}
          </TabsList>
        </div>
      </div>

      <TabsContent value="location">
        <OngletLocation
          property={property}
          personnel={personnel}
          lienVersLeBailleur={lienVersLeBailleur}
          onOuvrirLAnnonce={() => aller({ onglet: 'annonce', section: 'apercu' })}
        />
      </TabsContent>

      <TabsContent value="annonce" className="space-y-5">
        <div role="group" aria-label={t('sections')} className="flex flex-wrap gap-2">
          {section('apercu', t('overview'))}
          {section('edit', t('edit'))}
          {section('media', t('media', { count: property.photos?.length ?? 0 }))}
        </div>
        {position.section === 'apercu' ? (
          <div className="space-y-6">
            {/* TCK-2678 — pourquoi l'annonce est hors ligne, en tête de l'aperçu : la maquette retenue de la
                fiche (app-biens a-2) n'en dessine rien sous les pastilles de l'en-tête, la maquette b le
                rattache à l'annonce (« Annonce — Hors ligne »). Les gestes restent où ils sont. */}
            {motifs.length > 0 ? (
              <section data-slot="annonce-hors-ligne" className="rounded-xl bg-card p-5">
                <h2 className="text-base font-semibold text-foreground">{tIdentite('horsLigne')}</h2>
                <MotifsHorsLigne phrases={motifs} className="mt-1" />
              </section>
            ) : null}
            <PropertyOverviewPanel property={property} onJumpTo={sauter} />
            {/* TCK-504 — qui répond pour le bien, et le choisir : là où l'on relit le bien. */}
            <PropertyCollaboratorsPanel propertyId={property.id} />
          </div>
        ) : null}
        {position.section === 'edit' ? (
          <div>
            <PropertyForm mode="edit" property={property} tags={tags} />
            {/* TCK-633 (lot C) — les contacts sur place d'une annonce existante, enregistrés à part. */}
            <ContactsSurPlaceDuBien propertyId={property.id} />
          </div>
        ) : null}
        {position.section === 'media' ? <PropertyMediaPanel propertyId={property.id} /> : null}
      </TabsContent>

      <TabsContent value="interventions">
        <MaintenanceHistoryByProperty propertyId={property.id} />
      </TabsContent>

      <TabsContent value="documents">
        <OngletDocuments property={property} documents={documents} />
      </TabsContent>

      <TabsContent value="historique">
        <section className="rounded-xl bg-card p-6">
          <header>
            <h2 className="text-base font-semibold text-foreground">{t('fullPriceHistory')}</h2>
            <p className="text-xs text-muted-foreground">{t('fullPriceHistoryHint')}</p>
          </header>
          {priceHistory.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t('noPriceHistory')}</p>
          ) : (
            <PropertyPriceHistoryList entries={priceHistory} unknownDateLabel={t('unknownDate')} />
          )}
        </section>
      </TabsContent>

      {hasCalendar && (
        <TabsContent value="calendar">
          <PropertyCalendarPanel propertyId={property.id} />
        </TabsContent>
      )}
      {/* Téléphone : la barre collée du bas (portail dans l'emplacement de la coque). */}
      <BarreDuBien property={property} onOuvrirLAnnonce={(section) => aller({ onglet: 'annonce', section })} />
    </Tabs>
  );
}
