import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { BadgeCheck, Building2, Check, Clock, Mail, MapPin, Phone, ShieldCheck, Star, Store } from 'lucide-react';
import { ErrorState } from '@/components/feedback';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { BoutonRetour } from '@/components/shared/BoutonRetour';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ReviewsSection } from '@/components/public/profile/ReviewsSection';
import { ContactDeFiche } from '@/components/public/fiche/ContactDeFiche';
import { CouvertureDeFiche } from '@/components/public/fiche/CouvertureDeFiche';
import { OngletsDeFiche, type OngletDeFiche } from '@/components/public/fiche/OngletsDeFiche';
import { RechercheDuPortefeuille } from '@/components/public/fiche/RechercheDuPortefeuille';
import { SelectionDeFiche } from '@/components/public/fiche/SelectionDeFiche';
import { LogoDeFiche } from '@/components/public/fiche/LogoDeFiche';
import { EnTeteDeFiche } from '@/components/public/fiche/EnTeteDeFiche';
import { alternatesPubliques } from '@/lib/alternates';
import { resumePourMeta } from '@/lib/resume-pour-meta';
import { isLocale } from '@/i18n/config';
import { DonneesStructurees } from '@/lib/jsonld';
import { jsonLdAgence } from '@/lib/jsonld-profil';
import { getAgency, type AgencyDto } from '@/lib/queries/public-agency';
import { chargerPortefeuilleDeFiche } from '@/lib/queries/portefeuille-de-fiche';
import { delaiDeReponse, initiales } from '@/lib/fiche-publique';
import { telephonePublie } from '@/lib/phone';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

type Props = {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const t = await getTranslations('agency.publicPage');
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';
  const resultat = await getAgency(slug, brut);

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // ⚠️ CET APPEL NE PORTE **AUCUN** CODE HTTP. C'est le `notFound()` du CORPS DE PAGE qui le porte.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  //
  // Le dépôt a cru l'inverse — ce commentaire disait « c'est ce qui rend le CODE HTTP robuste » —
  // parce que la mesure d'origine (TCK-335) portait sur une sonde qui appelait `notFound()` AUX
  // DEUX endroits et n'avait donc jamais séparé leurs effets. Désagrégé le 2026-08-28, slug
  // d'agence inconnu, API vérifiée vivante à chaque relevé :
  //
  //     notFound() dans le SEUL generateMetadata  →  200   ← l'écran « introuvable », en 200
  //     notFound() dans le SEUL corps de page     →  404
  //     les deux (état de ce fichier)             →  404
  //
  // Le 404 vient donc du corps, et de lui seul. *Une mesure prise sur deux causes présentes à la
  // fois ne dit rien de chacune.*
  //
  // ⚠️ Ce que le corps produit ne survit qu'en l'absence de TOUTE frontière de suspension au-dessus
  // de lui — `loading.tsx` ou `<Suspense>` écrit à la main dans une disposition ancêtre. C'est ce
  // mécanisme-là, et non cette ligne, qui tient le 404 du site public ; il est verrouillé par
  // `[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts`.
  //
  // **Pourquoi cet appel reste, alors :** il est load-bearing pour les TYPES, pas pour le statut.
  // `notFound()` rend `never`, et c'est lui qui retire `{ etat: 'introuvable' }` de l'union avant
  // la lecture de `resultat.agence`. Sans lui, `tsc` casse :
  //     error TS2339: Property 'agence' does not exist on type '{ readonly etat: "introuvable"; }'
  // Il évite aussi de calculer des métadonnées pour une entité dont on sait qu'elle n'existe pas.
  if (resultat.etat === 'introuvable') notFound();

  if (resultat.etat === 'indisponible') {
    // ⚠️ **`robots: { index: false }` — une page qui ne sait pas ne s'offre pas à l'indexation.**
    // Ce cas reste une 200 parce qu'on ne sait PAS que l'agence n'existe pas : l'API n'a
    // simplement pas répondu. Servir un 404 ici graverait dans le statut une affirmation fausse
    // (c'est ce que faisait le `catch { return null }` d'avant TCK-438), et servir une 200
    // indexable offrirait un soft-404 aux moteurs — les deux défauts que TCK-335 a nommés.
    return {
      title: t('unavailableTitle'),
      description: t('unavailableMetaDescription'),
      robots: { index: false },
    };
  }

  const agency = resultat.agence;
  const summary = agency.stats
    ? agency.city
      ? t('metaSummaryInCity', { count: agency.portfolio_count, city: agency.city })
      : t('metaSummary', { count: agency.portfolio_count })
    : null;
  const title = t('metaTitle', { name: agency.name });
  // TCK-915 (P09.08) — la description résumée au mot, et une description vide prend le résumé.
  const description = resumePourMeta(agency.description) ?? summary ?? undefined;
  return {
    title,
    description,
    // Canonique + hreflang, dérivés du même chemin (TCK-433). Un profil public n'a pas de
    // variante d'URL à replier ; sans canonique explicite, Next n'en émet simplement aucune.
    alternates: alternatesPubliques(`/agencies/${slug}`, locale),
    openGraph: {
      title,
      description,
      images: agency.logo_url ? [agency.logo_url] : undefined,
    },
  };
}

/**
 * L'API n'a pas répondu — **et on ne dit surtout pas que l'agence n'existe pas.**
 *
 * ⚠️ Une FONCTION qui rend du JSX, et non un composant asynchrone : un composant `async` imbriqué
 * dans l'arbre rendu n'est rendu que par le moteur serveur, ce qui rendrait cette branche — la
 * seule que le test d'AC2 regarde — non testable sous jsdom. Même raison, même forme que
 * `bienIndisponible()` sur la fiche de bien.
 */
async function agenceIndisponible() {
  const t = await getTranslations('agency.publicPage');

  return (
    <div className="min-h-screen bg-background">
      {/* TCK-2568 — la panne ouvre, au téléphone, sur la barre de MARQUE (écran « Erreur serveur » de
          la maquette des erreurs) : le chemin de fiche, lui, n'a plus de barre du site. */}
      <Navbar auTelephone="marque" />
      <NavbarSpacer auTelephone="marque" />
      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8 focus:outline-none">
        <h1 className="mb-6 font-display text-2xl font-semibold text-foreground sm:text-3xl">
          {t('unavailableTitle')}
        </h1>
        <ErrorState message={t('unavailableBody')} />
      </main>
      <Footer />
    </div>
  );
}


/** Une rubrique de l'onglet Infos : une icône, un intitulé, une valeur. */
function Rubrique({ icone, titre, children }: { readonly icone: ReactNode; readonly titre: string; readonly children: ReactNode }) {
  return (
    <li className="flex gap-3.5 py-3.5">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary-deep" aria-hidden>
        {icone}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] text-muted-foreground">{titre}</p>
        <div className="text-[0.9375rem] text-foreground">{children}</div>
      </div>
    </li>
  );
}

/**
 * TCK-2522 — la fiche publique d'une agence : **la vitrine à onglets, couverture et recherche**
 * (maquette `?p=agence&a=d`).
 *
 * - En haut (de C) : la couverture composée de trois de ses biens, l'identité, l'accroche,
 *   « Pourquoi nous », puis la sélection — en tête de l'onglet Biens, visible au premier écran.
 * - Ensuite (de A) : les onglets collants Biens · Équipe · Avis · Infos, les biens en lignes denses
 *   (cartes en bureau) cherchables et filtrables, « Voir N biens de plus », la barre d'actions au
 *   téléphone et la colonne d'identité collante en bureau.
 *
 * **Rien de l'existant ne se perd** — retour, logo (monogramme en repli), badge vérifié, licence,
 * description, chiffres, Tous / À louer / À vendre avec les vrais totaux (facettes de l'API), avis
 * avec note moyenne et auteur abrégé (`ReviewsSection`), données structurées, vrai 404, état
 * « indisponible ». Sans accroche, sans « Pourquoi nous » et sans sélection, la fiche retombe sur la
 * forme A : aucun de ces blocs n'est rendu, et aucun cadre vide ne reste (AC4).
 *
 * Les filtres vivent dans l'URL, dans le dialecte de `/properties` (`?contract_type=rent&bedrooms=2`),
 * et la première page est rendue par le SERVEUR avec eux (AC1) : un lien partagé rouvre la même
 * sélection.
 */
export default async function Page({ params, searchParams }: Props) {
  const t = await getTranslations('agency.publicPage');
  const tProfil = await getTranslations('publicProfile');
  const tIndex = await getTranslations('publicProfileIndex');
  const { slug } = await params;
  const brutLocale = await getLocale();
  const locale = isLocale(brutLocale) ? brutLocale : 'fr';
  const resultat = await getAgency(slug, brutLocale);

  // Un 404 amont produit un VRAI 404 — statut compris. C'est la seule panne dont on sache qu'elle
  // signifie « cette agence n'existe pas ».
  if (resultat.etat === 'introuvable') notFound();
  if (resultat.etat === 'indisponible') return agenceIndisponible();

  const agency: AgencyDto = resultat.agence;
  const stats = agency.stats;
  const reviews = agency.reviews;
  const portefeuille = await chargerPortefeuilleDeFiche({ agency: agency.slug }, (await searchParams) ?? {}, brutLocale);

  const tagline = agency.tagline?.trim() || null;
  const highlights = (agency.highlights ?? []).map((h) => h.trim()).filter((h) => h !== '');
  const showcase = agency.showcase ?? [];
  const delai = delaiDeReponse(agency.median_response_minutes);
  const texteDelai = delai ? tProfil(`delai.${delai.unite}`, { n: delai.valeur }) : null;
  const bauxDuMois = agency.leases_signed_this_month ?? 0;
  const noteMoyenne = reviews && reviews.count > 0 && reviews.average !== null ? reviews.average : null;
  // Une agence sans aucun bien — ni dans sa fiche, ni dans la recherche — garde l'état vide d'avant :
  // pas de champ de recherche sur un portefeuille vide.
  const sansBien = agency.portfolio_total === 0 && (portefeuille.total ?? 0) === 0;

  const chiffres = stats
    ? [
        t('chiffres.louer', { count: stats.rent_count }),
        t('chiffres.vendre', { count: stats.sale_count }),
        t('chiffres.villes', { count: stats.cities }),
        t('chiffres.agents', { count: stats.agents }),
      ]
    : [];

  const onglets: OngletDeFiche[] = [
    {
      id: 'biens',
      libelle: t('onglets.biens'),
      compte: portefeuille.total ?? agency.portfolio_total,
      contenu: (
        <div className="space-y-10">
          <SelectionDeFiche biens={showcase} titre={t('selection')} idTitre="selection-heading" />
          {sansBien ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <Building2 className="mx-auto size-6 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-display text-xl text-foreground">{t('emptyTitle')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t('emptyBody')}</p>
            </div>
          ) : (
            <RechercheDuPortefeuille
              graine={portefeuille.graine}
              fixes={portefeuille.fixes}
              total={portefeuille.total}
              nom={agency.name}
              collerSous="onglets"
              titre={
                <h2 key="titre" id="portfolio-heading" className="font-display text-lg font-semibold tracking-tight text-foreground lg:text-2xl">
                  {showcase.length > 0 ? t('tousSesBiens') : t('portfolioHeading')}
                </h2>
              }
            />
          )}
        </div>
      ),
    },
  ];

  // TCK-2506 — l'équipe ne montre que des agents : l'API filtre déjà (`public_role === 'agent'`) ;
  // la page refiltre, pour qu'un propriétaire client ne s'y glisse jamais par une API plus ancienne.
  const equipe = agency.agents.filter((agent) => agent.public_role !== 'owner');
  if (equipe.length > 0) {
    onglets.push({
      id: 'equipe',
      libelle: t('onglets.equipe'),
      compte: equipe.length,
      contenu: (
        <section aria-labelledby="team-heading">
          <h2 id="team-heading" className="font-display text-lg font-semibold tracking-tight text-foreground lg:text-2xl">
            {t('equipeTitre', { count: equipe.length })}
          </h2>
          <ul className="mt-2 divide-y divide-border lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0">
            {equipe.map((agent) => {
              const ligne = (
                <>
                  <span className="relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-display text-[0.9375rem] font-semibold text-primary-deep">
                    {agent.avatar_url ? (
                      <Image src={agent.avatar_url} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <span aria-hidden>{initiales(agent.full_name)}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-foreground">{agent.full_name}</span>
                    <span className="block truncate text-[0.8125rem] text-muted-foreground">
                      {[agent.specialty, typeof agent.portfolio_count === 'number' && agent.portfolio_count > 0 ? tProfil('team.propertiesCount', { count: agent.portfolio_count }) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={agent.id} className="lg:border-b lg:border-border">
                  {agent.slug ? (
                    <LienLocalise href={`/agents/${encodeURIComponent(agent.slug)}`} className="flex min-h-[72px] items-center gap-3.5 py-3 hover:text-primary">
                      {ligne}
                    </LienLocalise>
                  ) : (
                    <div className="flex min-h-[72px] items-center gap-3.5 py-3">{ligne}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[0.8125rem] text-muted-foreground">{t('equipeNote')}</p>
        </section>
      ),
    });
  }

  if (reviews && reviews.count > 0 && reviews.recent.length > 0) {
    onglets.push({
      id: 'avis',
      libelle: t('onglets.avis'),
      compte: reviews.count,
      contenu: <ReviewsSection average={reviews.average} count={reviews.count} reviews={reviews.recent} />,
    });
  }

  const telephone = agency.phone ?? null;
  onglets.push({
    id: 'infos',
    libelle: t('onglets.infos'),
    contenu: (
      <section aria-labelledby="infos-heading">
        <h2 id="infos-heading" className="sr-only">
          {t('onglets.infos')}
        </h2>
        <ul className="divide-y divide-border">
          {agency.description ? (
            <Rubrique icone={<Store className="size-5" />} titre={t('infos.aPropos')}>
              <p className="leading-relaxed">{agency.description}</p>
            </Rubrique>
          ) : null}
          {agency.license_number || agency.is_verified ? (
            <Rubrique icone={<ShieldCheck className="size-5" />} titre={t('infos.licence')}>
              {[agency.license_number ? t('license', { number: agency.license_number }) : null, agency.is_verified ? t('infos.verifiee') : null]
                .filter(Boolean)
                .join(' · ')}
            </Rubrique>
          ) : null}
          {agency.city || (stats && stats.cities > 0) ? (
            <Rubrique icone={<MapPin className="size-5" />} titre={t('infos.ou')}>
              {[agency.city, stats && stats.cities > 0 ? t('chiffres.villes', { count: stats.cities }) : null].filter(Boolean).join(' · ')}
            </Rubrique>
          ) : null}
          {telephone ? (
            <Rubrique icone={<Phone className="size-5" />} titre={tProfil('contact.call')}>
              <a href={`tel:${telephonePublie(telephone)}`} className="tabular-nums underline-offset-4 hover:underline">
                {telephone}
              </a>
            </Rubrique>
          ) : null}
          {agency.email ? (
            <Rubrique icone={<Mail className="size-5" />} titre={t('infos.courriel')}>
              <a href={`mailto:${agency.email}`} className="break-all underline-offset-4 hover:underline">
                {agency.email}
              </a>
            </Rubrique>
          ) : null}
          {texteDelai ? (
            <Rubrique icone={<Clock className="size-5" />} titre={t('infos.delai')}>
              {texteDelai}
            </Rubrique>
          ) : null}
        </ul>
      </section>
    ),
  });

  return (
    // `max-lg:pb-20` : la barre d'actions fixée en bas ne recouvre pas le pied de page.
    <div className="min-h-screen bg-background max-lg:pb-20">
      {/*
        TCK-435 — le balisage n'affirme QUE ce que la page rend : la note agrégée n'est émise
        qu'au-dessus de zéro avis, la ville nulle ne devient pas la chaîne « null », et le
        contact ne dépasse pas ce que la page publie déjà.
      */}
      <DonneesStructurees donnees={jsonLdAgence(agency, locale)} />
      {/* TCK-2568 — au téléphone, PAS de barre du site : la fiche porte son en-tête (retour et
          partager sur la couverture, `EnTeteDeFiche` ; puis les onglets collés à `top-0`), comme la
          maquette FicheDBiens. La règle centrale (`enTeteAuTelephone`) le dit aussi depuis la vague 3 ;
          la surcharge reste écrite ici, à côté des `marque` de la panne et du 404. */}
      <Navbar auTelephone="en-tete-de-page" />
      <NavbarSpacer auTelephone="en-tete-de-page" />

      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="pb-32 focus:outline-none lg:pb-24">
        <div className="relative mx-auto max-w-[1280px] lg:px-8">
          {/* Au téléphone, retour et partager sur la couverture (maquette `CouvertureAgence`) ; la
              couverture sortie, les onglets collent à `top-0` et la recherche sous eux (FicheDBiens). */}
          <EnTeteDeFiche nom={agency.name} repli="/agencies">
            <CouvertureDeFiche photos={agency.cover ?? []} />
          </EnTeteDeFiche>
          {/* En bureau, la barre du site reste ; le retour d'avant (2026-09-16) aussi. */}
          <BoutonRetour
            repli="/agencies"
            libelle={t('back')}
            className="absolute left-11 top-3 ml-0 hidden bg-card text-foreground shadow-sm hover:bg-card lg:inline-flex"
          />
        </div>

        <div className="mx-auto grid max-w-[1280px] gap-x-12 px-4 sm:px-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-8">
          {/* Colonne d'identité — collante en bureau, avec la carte de contact. */}
          {/* La marge négative est sur la COLONNE (comme la maquette), pas sur le logo : collée, la colonne
              se pose à 96 px, et le logo ne passe pas sous la barre du site. */}
          <aside className="lg:sticky lg:top-[96px] lg:-mt-12 lg:self-start lg:pb-8">
            <LogoDeFiche
              src={agency.logo_url}
              nom={agency.name}
              initiales={initiales(agency.name)}
              className="-mt-9 size-[72px] rounded-2xl border-4 border-background lg:mt-0 lg:size-24"
            />

            <div className="mt-3 flex items-center gap-2">
              <h1 className="font-display text-[1.625rem] font-semibold leading-tight tracking-tight text-foreground text-balance lg:text-[2rem]">
                {agency.name}
              </h1>
              {/* TCK-1079 — le badge hors du titre : le nom accessible du `h1` reste le nom. */}
              {agency.is_verified && (
                <BadgeCheck role="img" className="size-5 shrink-0 text-primary lg:size-6" aria-label={tIndex('card.verified')} />
              )}
            </div>

            {noteMoyenne !== null || texteDelai ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                {noteMoyenne !== null && reviews ? (
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <Star className="size-3.5 fill-primary text-primary" aria-hidden />
                    <span className="font-semibold tabular-nums">{noteMoyenne.toFixed(1)}</span>
                    <span className="text-muted-foreground tabular-nums">({reviews.count})</span>
                  </span>
                ) : null}
                {texteDelai ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> {texteDelai}
                  </span>
                ) : null}
              </p>
            ) : null}

            {agency.license_number || bauxDuMois > 0 ? (
              <address className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.8125rem] not-italic text-muted-foreground">
                {bauxDuMois > 0 ? <span>{t('bauxDuMois', { count: bauxDuMois })}</span> : null}
                {bauxDuMois > 0 && agency.license_number ? <span aria-hidden>·</span> : null}
                {agency.license_number ? (
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    {t('license', { number: agency.license_number })}
                  </span>
                ) : null}
              </address>
            ) : null}

            {/* La description : au téléphone, elle cède la place à l'accroche (et reste dans Infos) —
                c'est ce qui garde la sélection au premier écran (AC2). Sans accroche, elle reste. */}
            {agency.description ? (
              <p className={`mt-3 line-clamp-3 text-[0.9375rem] leading-relaxed text-muted-foreground lg:line-clamp-none ${tagline ? 'hidden lg:block' : ''}`}>
                {agency.description}
              </p>
            ) : null}

            {chiffres.length > 0 ? (
              <p className="mt-2 text-[0.8125rem] text-muted-foreground lg:text-sm">{chiffres.join(' · ')}</p>
            ) : null}

            <div className="lg:mt-6">
              <ContactDeFiche
                nom={agency.name}
                telephone={telephone}
                message={agency.email ? { genre: 'courriel', adresse: agency.email, sujet: t('contactSubject', { name: agency.name }) } : null}
                sousTitre={texteDelai}
              />
            </div>
          </aside>

          <div className="min-w-0 pt-2 lg:pt-8">
            {tagline ? <p className="text-[1.0625rem] leading-snug text-foreground lg:max-w-[60ch] lg:text-xl">{tagline}</p> : null}
            {highlights.length > 0 ? (
              <ul aria-label={t('pourquoiNous')} className="mt-3 space-y-1.5 lg:mt-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
                {highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm font-medium text-foreground lg:text-[0.9375rem]">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary lg:size-5" aria-hidden />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className={tagline || highlights.length > 0 ? 'mt-5 lg:mt-10' : 'mt-2 lg:mt-0'}>
              <OngletsDeFiche onglets={onglets} libelle={t('onglets.libelle', { name: agency.name })} />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
