'use client';

import Image from 'next/image';
import NextLink from 'next/link';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronRight, Copy, ImagePlus, MapPin, MessageCircle, Pencil, Rocket, Search } from 'lucide-react';

import { DeclarerEntree } from '@/components/entree/CoqueDEntree';
import { PARAMETRE_BOOSTER } from '@/components/boost/parametre-booster';
import { isFieldRelevant } from '@/components/property-form/field-matrix';
import { marquerArriveeDeParcours } from '@/lib/arrivee-de-parcours';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { formaterTelephone } from '@/lib/phone';
import { copyToClipboard, liensDePartage } from '@/lib/share';
import type { ContractType, PropertyType, RentPeriod } from '@/types/property';
import type { EtatDeLAnnonce } from '@/lib/publication/annonce-en-ligne';
import { cn } from '@/lib/utils';

/**
 * TCK-2602 — « Votre annonce est en ligne » : la sortie de la publication d'un espace PARTICULIER
 * (`individual`), au lieu du toast et de la fiche (maquette `app-entree-publier`, a-8).
 *
 * Le particulier qui vient de publier voit son annonce telle qu'en liste, et ce qui lui amène des
 * demandes tout de suite : la partager sur WhatsApp, copier son lien, ajouter des photos, la booster.
 *
 * ## Ce que l'écran n'offre pas en vérification (`pending_review`, AC3)
 *
 * Rien de public n'existe encore : ni « Partager », ni « Copier le lien », ni « Booster » ne sont
 * RENDUS — pas désactivés, absents du DOM. Une seule bascule les gouverne tous (`enLigne`) : un
 * geste ajouté demain hors d'elle se verrait à la revue. « Voir mon annonce » mène alors à la fiche
 * de l'espace, pas à une page publique qui rendrait 404.
 *
 * ## Les sorties vers l'espace (TCK-2615)
 *
 * « Aller à mon espace », « Ajouter des photos », « Booster » et « Voir mon annonce » (en vérification)
 * mènent dans `/app` : chacune marque l'arrivée comme celle d'une publication AU CLIC — l'écran peut
 * rester ouvert plus que la fraîcheur du marqueur posé par l'assistant, et aucune fenêtre de
 * bienvenue ne doit se poser sur l'espace qu'on rejoint.
 *
 * ## « Booster » ne promet que ce que le boost fait
 *
 * Le dialogue de boost n'a pas de produit par défaut (`BoostDialog` : la personne choisit la mise en
 * avant et sa durée). Le libellé de la maquette (« En tête de liste à Mermoz pendant 7 jours ») en
 * promettrait un : il dit « mise en avant dans les recherches », vrai de tous les produits.
 */

/** Ce que la page lit du bien (`GET /api/properties/{id}`, la lecture mémoïsée de la fiche). */
export interface AnnonceEnLigneDonnees {
  readonly id: number;
  readonly titre: string;
  readonly reference: string;
  /** `en-ligne` : public et visible ; `verification` : en attente de modération. */
  readonly etat: EtatDeLAnnonce;
  readonly type: PropertyType;
  /** Le libellé du type, rendu par l'API (`type_label`). */
  readonly typeLibelle: string;
  readonly contrat: ContractType | null;
  readonly periode: RentPeriod | null;
  readonly prix: number;
  readonly devise: string | null;
  readonly quartier: string | null;
  readonly ville: string | null;
  readonly meuble: boolean;
  readonly surface: number | null;
  readonly etage: number | null;
  /** Le total à l'entrée calculé par l'API (`entry_cost.total`), `null` sans coût d'entrée. */
  readonly entree: number | null;
  readonly photo: string | null;
  readonly nombrePhotos: number;
  /** L'adresse publique ABSOLUE de la fiche (`/<langue>/properties/<slug>`), `null` sans slug. */
  readonly urlPublique: string | null;
}

export interface AnnonceEnLigneProps {
  readonly annonce: AnnonceEnLigneDonnees;
  /** Le numéro vérifié déclaré WhatsApp de l'auteur, E.164 ; `null` : les demandes arrivent dans l'espace. */
  readonly numeroWhatsApp: string | null;
  /** `boost.spend`, lu au serveur : qui ne peut pas dépenser de crédits ne se voit rien proposer. */
  readonly peutBooster: boolean;
}

/** Dix photos au plus : la limite de l'assistant (`StepPhotos`, `MAX_PHOTOS`). */
const MAX_PHOTOS = 10;
const ESPACE = '/app';

type Icone = ComponentType<{ readonly className?: string; readonly strokeWidth?: number; readonly 'aria-hidden'?: boolean }>;

/** Un numéro ou une référence ne se coupe pas en fin de ligne : ses blancs deviennent insécables. */
function insecable(texte: string): string {
  return texte.replace(/ /g, '\u00a0');
}

/** L'adresse affichée : sans le protocole (« takussan.com/fr/properties/… »). */
function adresseLisible(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/**
 * Le lien WhatsApp du partage : le titre, le prix et l'adresse publique, signée de sa source
 * (`utm_source=whatsapp`, `liensDePartage`, TCK-590). Exporté pour les tests (AC1).
 */
export function lienDePartageWhatsApp(texte: (url: string) => string, sujet: string, urlPublique: string): string {
  return liensDePartage(texte, sujet, urlPublique).whatsapp;
}

/** Le logo de WhatsApp, plein (`WhatsAppButton`). */
function IconeWhatsApp({ className }: { readonly className?: string }) {
  return (
    <svg className={cn('flex-none', className)} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/* Les boutons des écrans d'entrée (maquette `BoutonE`) : arrondi complet, 600. Des liens, pour la plupart. */
const BOUTON = 'inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';
const CONTOUR = 'border border-input/45 bg-card text-foreground hover:bg-muted';
const SOMBRE = 'bg-foreground text-background hover:bg-foreground/90';
const WHATSAPP = 'bg-success text-success-foreground hover:bg-success/90';

/** Une ligne d'action (maquette `LigneAction`) : icône, titre, note, chevron ; un lien ou un bouton. */
function LigneAction({
  icone: I,
  titre,
  note,
  href,
  onClick,
  testId,
}: {
  readonly icone: Icone;
  readonly titre: ReactNode;
  readonly note: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly testId?: string;
}) {
  const contenu = (
    <>
      <I className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden={true} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-corps font-medium text-foreground">{titre}</span>
        <span className="mt-0.5 block text-ui leading-snug break-words text-muted-foreground">{note}</span>
      </span>
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </>
  );
  const classes =
    'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset';
  return href ? (
    <NextLink href={href} onClick={onClick} className={classes} data-testid={testId}>
      {contenu}
    </NextLink>
  ) : (
    <button type="button" onClick={onClick} className={classes} data-testid={testId}>
      {contenu}
    </button>
  );
}

/** La pastille du contrat (« En location »), point sauge (point terracotta pour une vente). */
function Pastille({ contrat, libelle, surPhoto }: { readonly contrat: ContractType | null; readonly libelle: string; readonly surPhoto?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full text-xs font-semibold text-foreground',
        surPhoto ? 'h-7 gap-1.5 bg-card px-2.5' : 'h-6 gap-1.5 bg-muted px-2',
      )}
    >
      <span className={cn('size-1.5 rounded-full', contrat === 'sale' ? 'bg-primary' : 'bg-accent')} aria-hidden="true" />
      {libelle}
    </span>
  );
}

export function AnnonceEnLigne({ annonce, numeroWhatsApp, peutBooster }: AnnonceEnLigneProps) {
  const t = useTranslations('property.wizard.enLigne');
  const tContrats = useTranslations('property.contractTypes');
  const tPeriode = useTranslations('property.rentPeriodsShort');
  const fmt = useFormatteurs();
  const [copie, setCopie] = useState<'aucune' | 'faite' | 'refusee'>('aucune');

  // AC3 — la seule bascule de tout ce qui suppose une annonce publique : partage, lien, boost.
  const enLigne = annonce.etat === 'en-ligne' && annonce.urlPublique !== null;
  const urlPublique = enLigne ? annonce.urlPublique : null;

  const ctx = { type: annonce.type, contract: annonce.contrat ?? 'rent' } as const;
  // Une location sans période EST mensuelle (`Property::booted()`) ; une vente n'a pas de « /mois ».
  const periode = annonce.contrat === 'rent' && isFieldRelevant('rent_period', ctx) ? tPeriode(annonce.periode ?? 'monthly') : null;
  const prix = `${fmt.montant(annonce.prix, annonce.devise)}${periode ? ` /${periode}` : ''}`;
  const lieu = [annonce.quartier?.trim(), annonce.ville?.trim()].filter(Boolean).join(', ');
  const contrat = annonce.contrat === 'sale' ? tContrats('saleLong') : tContrats('rentLong');
  const meta = [
    annonce.typeLibelle,
    annonce.meuble && isFieldRelevant('furnished', ctx) ? t('meuble') : null,
    annonce.surface ? `${fmt.nombre(annonce.surface)} m²` : null,
    annonce.etage !== null && isFieldRelevant('floor_number', ctx) ? t('etage', { etage: annonce.etage }) : null,
  ].filter(Boolean);
  const recherche = t(annonce.contrat === 'sale' ? 'rechercheVendre' : 'rechercheLouer', { type: annonce.typeLibelle });
  const lieuDeRecherche = annonce.quartier?.trim() || annonce.ville?.trim() || null;

  const partage = urlPublique
    ? lienDePartageWhatsApp((url) => t('texteDePartage', { titre: annonce.titre, prix, url }), annonce.titre, urlPublique)
    : null;
  const fiche = `/app/properties/${annonce.id}`;
  const lienPhotos = `${fiche}?tab=media`;
  const lienBooster = `${fiche}?${PARAMETRE_BOOSTER}=1`;
  const versLEspace = () => marquerArriveeDeParcours('publication');
  const booster = enLigne && peutBooster;

  async function copier() {
    if (!urlPublique) return;
    setCopie((await copyToClipboard(urlPublique)) ? 'faite' : 'refusee');
  }

  const demandes = numeroWhatsApp ? t('demandes', { numero: insecable(formaterTelephone(numeroWhatsApp)) }) : t('demandesSansWhatsApp');
  const notePhotos = t('photosNote', { nombre: annonce.nombrePhotos, max: MAX_PHOTOS });

  const voir = (classes: string) =>
    urlPublique ? (
      <a href={urlPublique} target="_blank" rel="noopener" className={classes}>
        {t('voir')}
      </a>
    ) : (
      <NextLink href={fiche} onClick={versLEspace} className={classes}>
        {t('voir')}
      </NextLink>
    );
  const allerALEspace = (classes: string) => (
    <NextLink href={ESPACE} onClick={versLEspace} className={classes}>
      {t('espace')}
    </NextLink>
  );

  const photo = (sizes: string) =>
    annonce.photo ? <Image src={annonce.photo} alt="" fill sizes={sizes} className="object-cover" /> : null;

  return (
    <>
      <DeclarerEntree
        pleinEcran
        // Au bureau, la sortie de la barre (maquette `BarreBureau`, « Aller à mon espace » à droite).
        noteDeBarre={allerALEspace(cn(BOUTON, CONTOUR, 'h-9 px-4 text-sm'))}
      />
      <div className="flex min-h-0 flex-1 flex-col" data-annonce-en-ligne="">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-[30rem] grid-cols-1 px-4 pt-6 pb-8 lg:max-w-[62.5rem] lg:grid-cols-[35rem_21rem] lg:justify-between lg:px-8 lg:pt-12 lg:pb-16">
            <div className="min-w-0">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Check className="size-6" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <div className="mt-4">
                <h1 className="font-display text-affiche-28 leading-[1.12] font-semibold tracking-tight text-balance text-foreground lg:text-affiche-32 lg:leading-[1.08]">
                  {enLigne ? t('titre') : t('titreVerification')}
                </h1>
                <p className="mt-2 text-corps leading-normal text-muted-foreground lg:mt-3 lg:text-titre-court">
                  {/* La référence ne se coupe pas à son tiret (« PR-/ZQJNHKFG ») : elle passe entière à la ligne. */}
                  {t.rich(enLigne ? 'sousTitre' : 'sousTitreVerification', {
                    reference: annonce.reference,
                    ref: (morceaux) => <span className="whitespace-nowrap">{morceaux}</span>,
                  })}
                </p>
              </div>

              {/* L'annonce telle qu'en liste — au téléphone, la carte en ligne (photo de 104 px). */}
              <div className="mt-5 flex gap-3.5 rounded-xl border border-border bg-card p-2.5 lg:hidden" data-testid="carte-en-ligne">
                <span className="relative size-26 flex-none overflow-hidden rounded-lg bg-muted">{photo('104px')}</span>
                <div className="min-w-0 flex-1 py-0.5">
                  <Pastille contrat={annonce.contrat} libelle={contrat} />
                  <p className="mt-1.5 line-clamp-2 text-corps leading-snug font-semibold text-foreground">{annonce.titre}</p>
                  {lieu ? <p className="mt-0.5 text-ui text-muted-foreground">{lieu}</p> : null}
                  <p className="mt-1 font-display text-titre-court font-semibold text-primary-deep tabular-nums">{prix}</p>
                </div>
              </div>

              {/* Au bureau, la carte d'aperçu de l'assistant, photo en 16/9. */}
              <div className="mt-7 hidden overflow-hidden rounded-xl border border-border bg-card lg:block" data-testid="carte-en-ligne-bureau">
                <div className="relative aspect-video bg-muted">
                  {photo('560px')}
                  <span className="absolute top-3 left-3">
                    <Pastille contrat={annonce.contrat} libelle={contrat} surPhoto />
                  </span>
                  {annonce.nombrePhotos > 0 ? (
                    <span className="absolute right-3 bottom-3 rounded-full bg-foreground/70 px-2 py-0.5 text-xs font-medium text-background tabular-nums">
                      {t('photoSur', { total: annonce.nombrePhotos })}
                    </span>
                  ) : null}
                </div>
                <div className="p-4">
                  <p className="font-display text-titre-court leading-snug font-semibold text-foreground">{annonce.titre}</p>
                  {lieu ? (
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 flex-none" aria-hidden="true" />
                      {lieu}
                    </p>
                  ) : null}
                  {meta.length > 0 ? <p className="mt-1 text-ui text-muted-foreground">{meta.join(' · ')}</p> : null}
                  <p className="mt-2.5 font-display text-xl font-semibold text-primary-deep tabular-nums">{prix}</p>
                  {annonce.entree ? (
                    <p className="mt-0.5 text-ui text-muted-foreground tabular-nums">{t('entree', { montant: fmt.montant(annonce.entree, annonce.devise) })}</p>
                  ) : null}
                </div>
              </div>

              {partage ? (
                <div className="mt-5 flex gap-3">
                  <a
                    href={partage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(BOUTON, WHATSAPP, 'h-12 w-full px-6 text-action lg:w-auto lg:flex-1')}
                  >
                    <IconeWhatsApp className="size-5 lg:size-icone" />
                    {t('partager')}
                  </a>
                  <button type="button" onClick={() => void copier()} className={cn(BOUTON, CONTOUR, 'hidden h-12 px-6 text-action lg:inline-flex')}>
                    <Copy className="size-4" aria-hidden="true" />
                    {t('copier')}
                  </button>
                </div>
              ) : null}

              <div className={cn('divide-y divide-border rounded-xl border border-border bg-card', partage ? 'mt-3' : 'mt-5')}>
                {urlPublique ? (
                  <div className="lg:hidden">
                    <LigneAction
                      icone={Copy}
                      titre={copie === 'faite' ? t('copie') : t('copier')}
                      note={copie === 'refusee' ? t('copieImpossible') : adresseLisible(urlPublique)}
                      onClick={() => void copier()}
                      testId="copier-le-lien"
                    />
                  </div>
                ) : null}
                <LigneAction icone={ImagePlus} titre={t('photos')} note={notePhotos} href={lienPhotos} onClick={versLEspace} />
                {booster ? (
                  <div className="lg:hidden">
                    <LigneAction icone={Rocket} titre={t('booster')} note={t('boosterNote')} href={lienBooster} onClick={versLEspace} />
                  </div>
                ) : null}
              </div>
              {/* Au bureau, la copie se dit sous la carte des actions (le bouton n'a pas de note). */}
              <p role="status" className="sr-only lg:not-sr-only lg:mt-2 lg:block lg:text-ui lg:text-muted-foreground">
                {copie === 'faite' ? t('copie') : copie === 'refusee' && urlPublique ? `${t('copieImpossible')} — ${urlPublique}` : ''}
              </p>

              <p className="mt-4 text-ui leading-snug text-muted-foreground lg:hidden">{demandes}</p>

              <div className="mt-8 hidden items-center gap-3 border-t border-border pt-6 lg:flex">
                {voir(cn(BOUTON, CONTOUR, 'h-11 px-5 text-corps'))}
                {allerALEspace(cn(BOUTON, SOMBRE, 'h-11 px-5 text-corps'))}
              </div>
            </div>

            <aside className="hidden space-y-4 pt-[4.25rem] lg:block">
              {booster ? (
                <div className="rounded-xl border border-border bg-card p-5" data-testid="carte-booster">
                  <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary text-primary-deep">
                    <Rocket className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <p className="mt-3 font-display text-lg font-semibold text-foreground">{t('boosterTitre')}</p>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">{t('boosterTexte')}</p>
                  <NextLink href={lienBooster} onClick={versLEspace} className={cn(BOUTON, CONTOUR, 'mt-4 h-11 px-5 text-corps')}>
                    {t('boosterAction')}
                  </NextLink>
                </div>
              ) : null}
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-corps font-semibold text-foreground">{t('etMaintenant')}</p>
                <ul className="mt-3 space-y-3 text-sm leading-snug text-foreground">
                  <li className="flex gap-2.5">
                    <Search className="mt-0.5 size-4 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
                    <span>
                      {!enLigne
                        ? t('rechercheVerification')
                        : lieuDeRecherche
                          ? t('recherches', { lieu: lieuDeRecherche, recherche })
                          : t('recherchesSansLieu', { recherche })}
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <MessageCircle className="mt-0.5 size-4 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
                    <span>{demandes}</span>
                  </li>
                  <li className="flex gap-2.5">
                    <Pencil className="mt-0.5 size-4 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
                    <span>{t('modifiable')}</span>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </div>

        {/* Téléphone : le pied collé en bas (maquette `Pied`), les deux sorties à parts égales. */}
        <div className="flex flex-none gap-2.5 border-t border-border bg-card px-4 pt-3 pb-5 shadow-barre-collante lg:hidden" data-pied-en-ligne="">
          {voir(cn(BOUTON, CONTOUR, 'h-12 min-w-0 flex-1 px-3 text-corps'))}
          {allerALEspace(cn(BOUTON, SOMBRE, 'h-12 min-w-0 flex-1 px-3 text-corps'))}
        </div>
      </div>
    </>
  );
}
