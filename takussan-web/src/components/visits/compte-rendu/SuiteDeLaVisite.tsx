'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, ChevronRight, ClipboardPen } from 'lucide-react';

import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import type { ReponseDuCompteRendu } from '@/lib/queries/visits';
import { natureDuBien } from '@/lib/reservations/saisie-de-demande';
import { closableParCompteRendu, type CompteRendu, type Verdict } from '@/lib/visites/compte-rendu';
import type { ApiResponse } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';
import { cn } from '@/lib/utils';
import { EtMaintenant, ResumeDuCompteRendu, type BienDeLaSuite } from './EtMaintenant';
import { FormulaireDuCompteRendu } from './FormulaireDuCompteRendu';

/** Sous `md` : l'étape plein écran (la coque montre l'en-tête du téléphone jusque-là). */
export const REQUETE_TELEPHONE = '(width < 48rem)';

/** Les deux étapes du téléphone, dans l'URL (`?etape=`) : le retour arrière les défait une à une. */
export type EtapeDuCompteRendu = 'compte-rendu' | 'et-maintenant';

/** Le bien relu : la visite n'en porte ni la nature, ni la photo (même clé que `SaisirUneDemande`). */
interface BienLu {
  readonly id: number;
  readonly title: string | null;
  readonly slug: string | null;
  readonly contract_type: string | null;
  readonly rent_period: string | null;
  readonly main_photo_url?: string | null;
  /** TCK-2637 — `include=online` : la règle de la fiche publique (`Property::scopePublic()`). */
  readonly is_online?: boolean;
}

interface SuiteDeLaVisiteProps {
  readonly visite: PropertyVisit;
  /** Le haut du détail : le retour, la carte de la visite et ses gestes. */
  readonly principal: ReactNode;
  /** Le reste du détail : les avis, les dialogues. */
  readonly reste: ReactNode;
  /**
   * TCK-2587 — la visite est « en cours » : la carte et le formulaire attendent la fin prévue (ou
   * « Terminer »). Une étape demandée par l'URL (`?etape=`) reste servie, et un compte rendu déjà
   * écrit reste lu.
   */
  readonly masquee?: boolean;
}

/**
 * TCK-2581 (ADR-0101) — le compte rendu d'une visite et « Et maintenant ? », posés sur le détail.
 * Rendu seulement quand l'API a émis la clé `report` (le personnel de l'agence du bien) : le client,
 * le visiteur et le bailleur n'en voient rien, ni ici ni dans la réponse.
 *
 * - Téléphone : deux étapes plein écran, `?etape=compte-rendu` puis `?etape=et-maintenant` (maquette
 *   `app-fil-commercial`, écrans 4 et 5) ; sur le détail, une carte « Faire le compte rendu » ou le
 *   résumé du compte rendu fait.
 * - Dès `md` : en ligne, sous la carte de la visite ; dès `xl`, dans la colonne droite
 *   (`VisiteTermineeBureau`) — aucun dialogue.
 */
export function SuiteDeLaVisite({ visite, principal, reste, masquee = false }: SuiteDeLaVisiteProps) {
  const t = useTranslations('compteRendu');
  const tSuite = useTranslations('etMaintenant');
  const f = useFormatteurs();
  const telephone = useMatchesMedia(REQUETE_TELEPHONE);
  const recherche = useSearchParams();
  const router = useRouter();
  const chemin = usePathname();
  const [maintenant] = useState(() => Date.now());
  const [reponse, setReponse] = useState<ReponseDuCompteRendu | null>(null);
  const [edition, setEdition] = useState(false);
  const [verdictEnCours, setVerdictEnCours] = useState<Verdict | null>(null);

  // `include=online` : l'invitation WhatsApp mène à la fiche publique, qu'elle ne propose que si le
  // bien y est servi. Clé à part : `SaisirUneDemande` lit le même chemin sans `include`, et sa réponse
  // ne porterait pas `is_online`.
  const lecture = useApiQuery<ApiResponse<BienLu>>(
    ['saisie-demande', 'bien', visite.property_id, 'en-ligne'],
    cheminApi`/api/properties/${visite.property_id}`,
    { params: { include: ['online'] }, enabled: visite.property_id > 0 },
  );
  const lu = lecture.data?.data.id === visite.property_id ? lecture.data.data : null;
  const bien: BienDeLaSuite | null = lu
    ? { id: lu.id, titre: lu.title ?? visite.property?.title ?? '', slug: lu.slug ?? visite.property?.slug ?? null, nature: natureDuBien(lu), enLigne: typeof lu.is_online === 'boolean' ? lu.is_online : null }
    : null;

  // La réponse de l'écriture fait foi tant que la visite n'est pas relue (l'invalidation la relit).
  const compteRendu: CompteRendu | null = visite.report ?? reponse?.data.report ?? null;
  const closable = closableParCompteRendu(visite, maintenant);
  if (!compteRendu && (!closable || (masquee && recherche.get('etape') === null))) {
    return (
      <div className="space-y-6">
        {principal}
        {reste}
      </div>
    );
  }

  const client = visite.customer ?? null;
  const nom = client ? nomAffichable(client) : visite.visitor_display?.name ?? visite.visitor_name ?? null;
  const prenom = client?.first_name?.trim() || nom?.split(/\s+/)[0] || null;
  const rang = visite.visitor_display?.visits_on_property ?? null;
  const etapeSuggeree = reponse?.suggested_stage ?? null;
  const detail = `/app/visits/${visite.id}`;
  const etape = recherche.get('etape') as EtapeDuCompteRendu | null;
  const allerA = (e: EtapeDuCompteRendu | null, remplacer = false) => {
    const cible = e ? `${chemin}?etape=${e}` : chemin;
    if (remplacer) router.replace(cible);
    else router.push(cible);
  };

  const sousTitre = visite.scheduled_at
    ? visite.completed_at
      ? t('sousTitre', { debut: f.heure(visite.scheduled_at), fin: f.heure(visite.completed_at) })
      : t('sousTitreSansFin', { debut: f.heure(visite.scheduled_at) })
    : undefined;

  // ── Téléphone : l'étape remplace le détail. ──────────────────────────────────────────────────
  if (telephone && etape === 'compte-rendu') {
    return (
      // L'étape adopte la pleine largeur (`PagePleineLargeur`, TCK-2691) : 16 px sous l'en-tête, comme la
      // maquette gelée ; la marge latérale, c'est le formulaire qui la pose (densité « telephone »).
      <PagePleineLargeur data-slot="etape-compte-rendu" className="pt-4 pb-6">
        <DeclarerEnTete
          forme="plein-ecran"
          titre={t('titre')}
          sousTitre={sousTitre}
          repli={detail}
          droite={<span className="px-1.5 text-sm font-medium text-muted-foreground">{t('duree')}</span>}
        />
        <FormulaireDuCompteRendu
          visitId={visite.id}
          existant={compteRendu}
          densite="telephone"
          prenom={client ? prenom : null}
          entete={<CarteDuBien titre={bien?.titre ?? visite.property?.title ?? null} photo={lu?.main_photo_url ?? null} nom={nom} rang={rang} />}
          onEnregistre={(r) => {
            setReponse(r);
            allerA('et-maintenant', true);
          }}
        />
      </PagePleineLargeur>
    );
  }

  if (telephone && etape === 'et-maintenant' && compteRendu) {
    return (
      <PagePleineLargeur data-slot="etape-et-maintenant" className="pt-4 pb-6">
        <DeclarerEnTete
          forme="plein-ecran"
          titre={tSuite('titre')}
          sousTitre={prenom ? tSuite('sousTitre', { prenom }) : undefined}
          repli={detail}
          droite={
            <Link
              href={detail}
              // La boîte du texte (la maquette), la cible de 44 px par le pseudo-élément (patron de `ui/toast`).
              className="relative rounded-md px-1.5 text-sm font-medium text-muted-foreground outline-none after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
            >
              {tSuite('passer')}
            </Link>
          }
        />
        <EtMaintenant
          visite={visite}
          compteRendu={compteRendu}
          bien={bien}
          etapeSuggeree={etapeSuggeree}
          densite="telephone"
          onModifier={() => allerA('compte-rendu')}
          onTermine={() => router.push(detail)}
        />
      </PagePleineLargeur>
    );
  }

  // ── Le détail, et la suite posée dessus. ──────────────────────────────────────────────────────
  let panneau: ReactNode;
  if (telephone) {
    panneau = compteRendu ? (
      <div data-slot="compte-rendu-fait" className="space-y-2">
        <ResumeDuCompteRendu
          compteRendu={compteRendu}
          verdict={t(`verdicts.${compteRendu.outcome}`)}
          objections={compteRendu.objections.map((o) => t(`objections.${o}`))}
          enregistre={compteRendu.reported_at ? tSuite('enregistre', { heure: f.heure(compteRendu.reported_at) }) : null}
          modifier={tSuite('modifier')}
          onModifier={() => allerA('compte-rendu')}
        />
        <Link
          href={`${chemin}?etape=et-maintenant`}
          className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-corps font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">{tSuite('titre')}</span>
          <ChevronRight className="size-4.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    ) : (
      <Link
        href={`${chemin}?etape=compte-rendu`}
        data-slot="faire-le-compte-rendu"
        className="flex items-center gap-3 rounded-xl border border-primary/30 bg-secondary/60 px-4 py-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ClipboardPen className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 leading-snug">
          <span className="block text-corps font-semibold text-foreground">{t('faire')}</span>
          <span className="block text-ui text-muted-foreground">{t('faireDetail')}</span>
        </span>
        <ChevronRight className="size-4.5 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />
      </Link>
    );
  } else if (compteRendu && !edition) {
    panneau = (
      <section aria-label={tSuite('titre')}>
        <EtMaintenant
          visite={visite}
          compteRendu={compteRendu}
          bien={bien}
          etapeSuggeree={etapeSuggeree}
          densite="colonne"
          onModifier={() => setEdition(true)}
        />
      </section>
    );
  } else {
    panneau = (
      <div className="space-y-4">
        <section data-slot="carte-compte-rendu" className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="min-w-0 flex-1 text-corps font-semibold text-foreground">{t('titre')}</h2>
            <span className="text-sm font-medium text-primary">{t('dureeLongue')}</span>
          </div>
          <div className="p-4">
            <FormulaireDuCompteRendu
              visitId={visite.id}
              existant={compteRendu}
              densite="colonne"
              prenom={client ? prenom : null}
              onVerdict={setVerdictEnCours}
              onEnregistre={(r) => {
                setReponse(r);
                setEdition(false);
              }}
            />
          </div>
        </section>
        {!compteRendu ? (
          <EtMaintenant
            visite={visite}
            compteRendu={null}
            verdictEnCours={verdictEnCours}
            bien={bien}
            densite="colonne"
            onModifier={() => undefined}
          />
        ) : null}
      </div>
    );
  }

  // La colonne droite de la maquette : `min(500px, 46%)` (VisiteTermineeBureau). Dès `lg`, le pas vaut
  // 3,6 px (ADR-0107) : 139 pas = 500 px, sur l'échelle.
  return (
    <div className={cn('grid gap-6', !telephone && 'xl:grid-cols-[minmax(0,1fr)_min(calc(var(--spacing)*139),46%)] xl:grid-rows-[auto_1fr] xl:items-start')}>
      <div className="min-w-0 space-y-6">{principal}</div>
      <aside data-slot="suite-de-la-visite" className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
        {panneau}
      </aside>
      <div className="min-w-0 space-y-6 xl:col-start-1">{reste}</div>
    </div>
  );
}

/** La carte du bien en tête de l'étape (maquette : vignette de 48, « avec <nom> · 1ʳᵉ visite »). */
function CarteDuBien({ titre, photo, nom, rang }: { readonly titre: string | null; readonly photo: string | null; readonly nom: string | null; readonly rang: number | null }) {
  const t = useTranslations('compteRendu');
  const ligne = [nom ? t('avec', { nom }) : null, rang ? t('rang', { n: rang }) : null].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      {photo ? (
        <Image src={photo} alt="" width={48} height={48} className="size-12 flex-none rounded-lg bg-muted object-cover" />
      ) : (
        <span aria-hidden className="flex size-12 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Building2 className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-corps font-semibold text-foreground">{titre}</p>
        {ligne ? <p className="truncate text-ui text-muted-foreground">{ligne}</p> : null}
      </div>
    </div>
  );
}
