'use client';

import { useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bath, BedDouble, Check, ChevronLeft, ChevronRight, Images, Loader2, MapPin, Maximize2, TriangleAlert } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import {
  MOTIFS_DE_CORRECTION,
  RAISON_MAX,
  RAISON_MIN,
  approveProperty,
  fetchPropertyModerationDetail,
  propertyModerationDetailKey,
  rejectProperty,
  type ModerationProperty,
  type PropertyModerationDetail as DetailDuBien,
  type PropertyRejectionReasonCode,
} from '@/lib/queries/property-moderation';
import { StatusBadge } from '@/components/console';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ErreurDeLecture } from '@/components/feedback';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { PROPERTY_ENUM_NAMESPACES, enumLabel } from '@/components/property-form/options';
import { propertyTypeValues } from '@/lib/enums/property';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initiales } from '@/lib/fiche-publique';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cn } from '@/lib/utils';

interface PropertyModerationDetailProps {
  /** La ligne de la file : son titre s'affiche pendant que le détail se lit. */
  readonly property: ModerationProperty;
  /** Après une décision : le message à dire, la file se relit. */
  readonly onModerated: (message?: string) => void;
  /** Au téléphone : plein écran, les gestes dans la barre collante, la correction dans une feuille. */
  readonly telephone?: boolean;
}

/** TCK-2673 — l'écart à la médiane du quartier à partir duquel le prix est un « point à voir ». */
export const ECART_DE_PRIX_A_VOIR = 25;

const PERIODES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

/**
 * TCK-098 → TCK-2673 — le bien soumis, vu COMME LE PUBLIC LE VERRA (maquette `app-moderation` B,
 * « Bien à valider ») : toutes ses photos, titre, lieu, prix en F CFA et sa période, type en
 * français, caractéristiques, description, qui l'a soumis et avec quel profil (TCK-2672), puis la
 * liste de contrôle et les deux gestes — Publier, Demander une correction (motif codé et 20
 * caractères au moins, renvoyé à l'auteur).
 */
export function PropertyModerationDetail({ property, onModerated, telephone = false }: PropertyModerationDetailProps) {
  const t = useTranslations('admin.propertyModeration.bien');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  // TCK-1203 — trancher un bien exige la 2FA d'un profil plateforme (`PropertyModerationController`).
  const garde = useGardeDoubleFacteur();
  const idCorrection = useId();
  const [motif, setMotif] = useState<PropertyRejectionReasonCode | ''>('');
  const [raison, setRaison] = useState('');
  const [feuille, setFeuille] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: propertyModerationDetailKey(property.id),
    queryFn: () => fetchPropertyModerationDetail(property.id, token ?? ''),
    enabled: Boolean(token),
  });
  const bien = detail.data?.data ?? null;

  const publier = useMutation({
    mutationFn: () => avecGardeDoubleFacteur(() => approveProperty(property.id, token ?? ''), garde),
    onSuccess: () => {
      setErrorMessage(null);
      onModerated(t('publie'));
    },
    onError: (err) => setErrorMessage(messageErreur(err, t('publierEchec'))),
  });

  const corriger = useMutation({
    mutationFn: (demande: { reasonCode: PropertyRejectionReasonCode; rejectionReason: string }) =>
      avecGardeDoubleFacteur(() => rejectProperty(property.id, demande, token ?? ''), garde),
    onSuccess: () => {
      setFeuille(false);
      setMotif('');
      setRaison('');
      setErrorMessage(null);
      onModerated(t('correction.envoyee'));
    },
    onError: (err) => setErrorMessage(messageErreur(err, t('correction.echec'))),
  });

  const occupe = publier.isPending || corriger.isPending;
  // AC5 — « Demander une correction » reste inactif sans motif ou sous 20 caractères.
  const correctionPrete = motif !== '' && raison.trim().length >= RAISON_MIN;
  const envoyerLaCorrection = () => {
    if (!correctionPrete) return;
    setErrorMessage(null);
    corriger.mutate({ reasonCode: motif, rejectionReason: raison.trim() });
  };

  const auteur = bien?.submitted_by?.name ?? null;
  const formulaire = (
    <div className="space-y-3">
      <RadioGroup
        value={motif}
        onValueChange={(v) => setMotif(v as PropertyRejectionReasonCode)}
        aria-label={t('correction.motifLegende')}
        className="gap-2"
      >
        {MOTIFS_DE_CORRECTION.map((m) => (
          <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm md:min-h-0">
            <Radio value={m} />
            {t(`correction.motifs.${m}`)}
          </label>
        ))}
      </RadioGroup>
      <div>
        <label htmlFor={idCorrection} className="sr-only">
          {t('correction.texte')}
        </label>
        <Textarea
          id={idCorrection}
          value={raison}
          onChange={(e) => setRaison(e.target.value)}
          rows={3}
          maxLength={RAISON_MAX}
          placeholder={t('correction.placeholder')}
          aria-describedby={`${idCorrection}-compteur`}
        />
        <p id={`${idCorrection}-compteur`} className="mt-1 text-xs tabular-nums text-muted-foreground">
          {auteur
            ? t('correction.compteur', { nom: auteur, min: RAISON_MIN, n: raison.trim().length })
            : t('correction.compteurSansNom', { min: RAISON_MIN, n: raison.trim().length })}
        </p>
      </div>
    </div>
  );

  const boutonPublier = (
    <Button size="lg" onClick={() => publier.mutate()} disabled={occupe}>
      {publier.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {t('publier')}
    </Button>
  );

  const erreur = errorMessage ? (
    <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {errorMessage}
    </p>
  ) : null;

  if (detail.isLoading) {
    return (
      <div role="status" className="space-y-3" data-testid="property-moderation-detail">
        <span className="sr-only">{property.title}</span>
        <Skeleton className="aspect-[4/3] w-full rounded-xl" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (detail.isError || !bien) {
    return (
      <div data-testid="property-moderation-detail">
        <ErreurDeLecture
          erreur={detail.error}
          message={messageErreur(detail.error, t('detailIllisible'))}
          onRetry={() => void detail.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      </div>
    );
  }

  if (telephone) {
    return (
      <PagePleineLargeur data-testid="property-moderation-detail" data-slot="bien-a-valider">
        <Carrousel bien={bien} />
        <div className="space-y-4 p-4">
          <EnTeteDeLAnnonce bien={bien} />
          <Caracteristiques bien={bien} />
          <Description bien={bien} />
          {bien.photos.length > 1 ? (
            <ul className="grid grid-cols-3 gap-1.5" aria-label={t('autresPhotos')}>
              {bien.photos.slice(1, 4).map((p) => (
                <li key={p.id} className="aspect-square overflow-hidden rounded-lg bg-muted">
                  <Photo url={p.url} />
                </li>
              ))}
            </ul>
          ) : null}
          <Soumission bien={bien} />
          <ListeDeControle bien={bien} />
          {erreur}
          <p className="text-ui text-muted-foreground">{t('rappel', { min: RAISON_MIN })}</p>
        </div>
        <BarreDAction secondaire="premier">
          <Button size="lg" variant="outline" className="px-3.5 text-sm" onClick={() => setFeuille(true)} disabled={occupe}>
            {t('correction.titre')}
          </Button>
          {boutonPublier}
        </BarreDAction>
        <FeuilleDuBas
          open={feuille}
          onOpenChange={setFeuille}
          titre={t('correction.titre')}
          pied={
            <Button className="w-full" onClick={envoyerLaCorrection} disabled={!correctionPrete || occupe}>
              {corriger.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t('correction.envoyer')}
            </Button>
          }
        >
          {formulaire}
          {errorMessage && feuille ? <div className="mt-3">{erreur}</div> : null}
        </FeuilleDuBas>
      </PagePleineLargeur>
    );
  }

  return (
    <div className="flex items-start gap-6 max-xl:flex-col" data-testid="property-moderation-detail" data-slot="bien-a-valider">
      <div className="min-w-0 flex-1 rounded-2xl bg-muted p-5 max-xl:w-full">
        <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex h-6 items-center rounded-full bg-card px-2.5">{t('apercu')}</span>
          {t('apercuTexte')}
        </p>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Mosaique bien={bien} />
          <div className="space-y-4 p-6">
            <EnTeteDeLAnnonce bien={bien} grand />
            <Caracteristiques bien={bien} />
            <Description bien={bien} />
            <Soumission bien={bien} />
          </div>
        </div>
      </div>

      <div className="w-[min(360px,100%)] flex-none space-y-4 max-xl:w-full xl:sticky xl:top-6">
        <ListeDeControle bien={bien} />
        <section className="rounded-xl border border-border bg-card" aria-labelledby={`${idCorrection}-titre`}>
          <h3 id={`${idCorrection}-titre`} className="border-b border-border px-4 py-3 text-corps font-semibold">
            {t('correction.titre')}
          </h3>
          <div className="p-4">{formulaire}</div>
        </section>
        {erreur}
        <div className="flex gap-2 *:flex-1">
          <Button size="lg" variant="outline" className="px-3 text-sm" onClick={envoyerLaCorrection} disabled={!correctionPrete || occupe}>
            {corriger.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t('correction.titre')}
          </Button>
          {boutonPublier}
        </div>
        <p className="text-ui text-muted-foreground">{t('rappel', { min: RAISON_MIN })}</p>
      </div>
    </div>
  );
}

/* ── Les pièces de l'aperçu ─────────────────────────────────────────────────────────────── */

function Photo({ url, className }: { readonly url: string | null; readonly className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- conversion `preview` de l'API, déjà dimensionnée
    <img src={url} alt="" className={cn('size-full object-cover', className)} loading="lazy" />
  ) : (
    <span className={cn('block size-full bg-muted', className)} />
  );
}

/** Téléphone : une photo à la fois, ses points et son compte « 1 / 6 », flèches pour passer. */
function Carrousel({ bien }: { readonly bien: DetailDuBien }) {
  const t = useTranslations('admin.propertyModeration.bien');
  const [i, setI] = useState(0);
  const n = bien.photos.length;
  if (n === 0) {
    return <div className="flex aspect-[4/3] items-center justify-center bg-muted text-sm text-muted-foreground">{t('sansPhoto')}</div>;
  }
  const photo = bien.photos[Math.min(i, n - 1)];
  return (
    <div className="relative aspect-[4/3] bg-muted" role="group" aria-roledescription={t('carrousel')} aria-label={t('photo', { i: i + 1, n })}>
      <Photo url={photo.url} />
      {n > 1 ? (
        <>
          <button
            type="button"
            onClick={() => setI((i - 1 + n) % n)}
            aria-label={t('photoPrecedente')}
            className="absolute inset-y-0 left-0 w-1/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronLeft className="sr-only" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setI((i + 1) % n)}
            aria-label={t('photoSuivante')}
            className="absolute inset-y-0 right-0 w-1/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronRight className="sr-only" aria-hidden="true" />
          </button>
          <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
            {bien.photos.map((p, k) => (
              <span key={p.id} className={cn('size-1.5 rounded-full', k === i ? 'bg-card' : 'bg-card/55')} />
            ))}
          </span>
        </>
      ) : null}
      <span className="absolute right-3 bottom-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-2.5 text-xs font-medium tabular-nums text-background">
        <Images className="size-3.5" aria-hidden="true" />
        {i + 1} / {n}
      </span>
    </div>
  );
}

/** Bureau : la mosaïque de la fiche publique (une grande, quatre petites). */
function Mosaique({ bien }: { readonly bien: DetailDuBien }) {
  const t = useTranslations('admin.propertyModeration.bien');
  if (bien.photos.length === 0) {
    return (
      <div className="flex h-[calc(var(--spacing)*75)] items-center justify-center bg-muted text-sm text-muted-foreground">{t('sansPhoto')}</div>
    );
  }
  const [premiere, ...autres] = bien.photos;
  const petites = autres.slice(0, 4);
  // La mosaïque de la fiche publique sans case vide : 1 + 4 en deux rangées ; 1 + 3, la deuxième sur
  // deux rangées ; 1 + 2 ou 1 + 1, une colonne à droite.
  const colonnes = petites.length >= 3 ? 'grid-cols-[2fr_1fr_1fr]' : petites.length > 0 ? 'grid-cols-[2fr_1fr]' : 'grid-cols-1';
  const lignes = petites.length === 1 ? 'grid-rows-1' : 'grid-rows-2';
  return (
    <div className={cn('grid h-[calc(var(--spacing)*75)] gap-1', colonnes, lignes)}>
      <div className="relative row-span-2 min-h-0">
        <Photo url={premiere.url} />
      </div>
      {petites.map((p, k) => (
        <div key={p.id} className={cn('min-h-0', petites.length === 3 && k === 0 && 'row-span-2')}>
          <Photo url={p.url} />
        </div>
      ))}
    </div>
  );
}

function EnTeteDeLAnnonce({ bien, grand = false }: { readonly bien: DetailDuBien; readonly grand?: boolean }) {
  const t = useTranslations('admin.propertyModeration.bien');
  const { montant } = useFormatteurs();
  const lieu = [bien.address?.neighborhood, bien.address?.city].filter(Boolean).join(', ');
  const periode =
    bien.contract_type === 'rent' && bien.rent_period && (PERIODES as readonly string[]).includes(bien.rent_period)
      ? t(`parPeriode.${bien.rent_period as (typeof PERIODES)[number]}`)
      : null;
  return (
    <div>
      <h2 className={cn('font-display font-semibold leading-tight tracking-tight', grand ? 'text-affiche-26' : 'text-affiche-22')}>{bien.title}</h2>
      {lieu ? (
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {lieu}
        </p>
      ) : null}
      {bien.price !== null ? (
        <p className="mt-2.5 flex items-baseline gap-1.5" data-slot="prix-du-bien">
          <span className={cn('font-display font-semibold tabular-nums tracking-tight', grand ? 'text-affiche-28' : 'text-2xl')}>
            {montant(bien.price, bien.currency)}
          </span>
          {periode ? <span className="text-sm text-muted-foreground">{periode}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function Caracteristiques({ bien }: { readonly bien: DetailDuBien }) {
  const t = useTranslations('admin.propertyModeration.bien');
  const tTypes = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const { nombre } = useFormatteurs();
  const liste: { readonly cle: string; readonly icone: typeof BedDouble | null; readonly texte: string }[] = [];
  if (bien.type) liste.push({ cle: 'type', icone: null, texte: enumLabel(tTypes, propertyTypeValues, bien.type) });
  if (bien.bedrooms) liste.push({ cle: 'chambres', icone: BedDouble, texte: t('chambres', { n: bien.bedrooms }) });
  if (bien.bathrooms) liste.push({ cle: 'sdb', icone: Bath, texte: t('sallesDEau', { n: bien.bathrooms }) });
  if (bien.area) liste.push({ cle: 'surface', icone: Maximize2, texte: t('surface', { n: nombre(bien.area) }) });
  if (liste.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {liste.map(({ cle, icone: Icone, texte }) => (
        <li key={cle} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-ui font-medium">
          {Icone ? <Icone className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" /> : null}
          {texte}
        </li>
      ))}
    </ul>
  );
}

function Description({ bien }: { readonly bien: DetailDuBien }) {
  const t = useTranslations('admin.propertyModeration.bien');
  return bien.description?.trim() ? (
    <p className="max-w-prose whitespace-pre-wrap text-corps leading-relaxed">{bien.description}</p>
  ) : (
    <p className="text-sm text-muted-foreground">{t('sansDescription')}</p>
  );
}

function Soumission({ bien }: { readonly bien: DetailDuBien }) {
  const t = useTranslations('admin.propertyModeration.bien');
  const { jourMois, heure } = useFormatteurs();
  const auteur = bien.submitted_by;
  const detail = [
    auteur ? t(`profils.${auteur.profile}`) : null,
    // Une date absente ne s'invente pas : la démo a des biens soumis sans `submitted_at`.
    bien.submitted_at ? t('leDate', { date: `${jourMois(bien.submitted_at)} · ${heure(bien.submitted_at)}` }) : null,
    auteur && bien.submitted_count_in_agency > 0 ? t('rang', { n: bien.submitted_count_in_agency }) : null,
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3" data-slot="soumission">
      <Avatar size="40">
        <AvatarFallback>{initiales(auteur?.name ?? '') || '?'}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-sm">
          {t('soumisPar')} <span className="font-semibold">{auteur?.name ?? t('auteurInconnu')}</span>
        </p>
        {detail.length > 0 ? <p className="mt-0.5 text-ui text-muted-foreground">{detail.join(' · ')}</p> : null}
      </div>
    </div>
  );
}

type EtatDuPoint = 'ok' | 'a-voir' | 'neutre';
type Point = { readonly cle: string; readonly etat: EtatDuPoint; readonly titre: string; readonly detail: string };

/** Les points de la liste de contrôle, dérivés des `checks` de l'API (TCK-2672). */
export function pointsDeControle(
  bien: DetailDuBien,
  t: ReturnType<typeof useTranslations<'admin.propertyModeration.bien'>>,
  montantCourt: (v: number, c?: string | null) => string,
  pourcentage: (v: number) => string,
): Point[] {
  const c = bien.checks;
  const lieu = [bien.address?.neighborhood, bien.address?.city].filter(Boolean).join(', ');
  const points: Point[] = [
    c.photos_count >= c.photos_expected
      ? {
          cle: 'photos',
          etat: 'ok',
          titre: t('controle.photosOk', { n: c.photos_count }),
          detail: t('controle.photosDetail', { n: c.photos_expected }),
        }
      : {
          cle: 'photos',
          etat: 'a-voir',
          titre: t('controle.photosManque', { n: c.photos_count }),
          detail: t('controle.photosDetail', { n: c.photos_expected }),
        },
    c.address_complete
      ? { cle: 'adresse', etat: 'ok', titre: t('controle.adresseOk'), detail: t('controle.adresseOkDetail', { lieu }) }
      : { cle: 'adresse', etat: 'a-voir', titre: t('controle.adresseManque'), detail: t('controle.adresseManqueDetail') },
    {
      cle: 'description',
      etat: c.description_has_contact || c.description_words === 0 ? 'a-voir' : 'ok',
      titre: t('controle.description', { n: c.description_words }),
      detail: c.description_has_contact ? t('controle.descriptionContact') : t('controle.descriptionSansContact'),
    },
  ];
  const m = c.price_vs_median;
  if (m === null) {
    points.push({ cle: 'prix', etat: 'neutre', titre: t('controle.prixSansMediane'), detail: t('controle.prixSansMedianeDetail') });
  } else {
    const ecart = pourcentage(Math.abs(m.deviation_pct) / 100);
    points.push({
      cle: 'prix',
      etat: Math.abs(m.deviation_pct) >= ECART_DE_PRIX_A_VOIR ? 'a-voir' : 'ok',
      titre: m.deviation_pct >= 0 ? t('controle.prixAuDessus', { pct: ecart }) : t('controle.prixAuDessous', { pct: ecart }),
      detail: t('controle.prixDetail', { n: m.sample_size, median: montantCourt(m.median, bien.currency) }),
    });
  }
  return points;
}

function ListeDeControle({ bien }: { readonly bien: DetailDuBien }) {
  const t = useTranslations('admin.propertyModeration.bien');
  const { montantCourt, pourcentage } = useFormatteurs();
  const id = useId();
  const points = pointsDeControle(
    bien,
    t,
    (v, c) => montantCourt(v, c),
    (v) => pourcentage(v),
  );
  const aVoir = points.filter((p) => p.etat === 'a-voir').length;
  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby={id} data-slot="liste-de-controle">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h3 id={id} className="min-w-0 flex-1 text-corps font-semibold">
          {t('controle.titre')}
        </h3>
        <StatusBadge tone={aVoir > 0 ? 'attention' : 'success'} label={aVoir > 0 ? t('controle.aVoir', { n: aVoir }) : t('controle.rien')} />
      </div>
      <ul>
        {points.map((p) => (
          <li key={p.cle} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
            <PastilleDuPoint etat={p.etat} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{p.titre}</p>
              <p className="text-ui tabular-nums text-muted-foreground">{p.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** La pastille d'un point : un point bon, à voir, ou sans avis — trois formes fixes. */
function PastilleDuPoint({ etat }: { readonly etat: EtatDuPoint }) {
  const base = 'mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full';
  if (etat === 'ok') {
    return (
      <span className={cn(base, 'bg-success/15 text-success')}>
        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (etat === 'a-voir') {
    return (
      <span className={cn(base, 'bg-warning/20 text-warning')}>
        <TriangleAlert className="size-3" strokeWidth={2.5} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={cn(base, 'bg-muted text-muted-foreground')}>
      <TriangleAlert className="size-3" strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}
