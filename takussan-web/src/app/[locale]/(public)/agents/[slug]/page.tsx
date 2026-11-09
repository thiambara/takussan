import { notFound, permanentRedirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Building2, ChevronRight, Clock, Languages, MapPin, ShieldCheck, Star } from 'lucide-react';
import { ErrorState } from '@/components/feedback';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { BoutonRetour } from '@/components/shared/BoutonRetour';
import { PortfolioTabs } from '@/components/public/profile/PortfolioTabs';
import { ReviewsSection } from '@/components/public/profile/ReviewsSection';
import { ContactDeFiche, type CanalDeMessage } from '@/components/public/fiche/ContactDeFiche';
import { EnTeteDeFiche } from '@/components/public/fiche/EnTeteDeFiche';
import { RechercheDuPortefeuille } from '@/components/public/fiche/RechercheDuPortefeuille';
import { alternatesPubliques } from '@/lib/alternates';
import { resumePourMeta } from '@/lib/resume-pour-meta';
import { isLocale } from '@/i18n/config';
import { DonneesStructurees } from '@/lib/jsonld';
import { jsonLdAgent } from '@/lib/jsonld-profil';
import { getAgent, type AgentDto } from '@/lib/queries/public-agent';
import { chargerPortefeuilleDeFiche } from '@/lib/queries/portefeuille-de-fiche';
import { aUneRecherche, delaiDeReponse, initiales, nomAbrege } from '@/lib/fiche-publique';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

type Props = {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * TCK-573 — tout ce qui n'est pas explicitement `agent` est présenté en propriétaire (une API plus
 * ancienne qui n'émet pas le champ, une valeur inconnue).
 */
const estUnAgent = (agent: AgentDto) => agent.public_role === 'agent';

/**
 * TCK-2523 (décision 1b) — le nom AFFICHÉ : complet pour un agent, ABRÉGÉ pour un propriétaire
 * (« Sokhna G. »), partout — titre de la page, `<h1>`, données structurées, contact, partage.
 *
 * ⚠ L'API sert encore `full_name` et `last_name` en entier pour un propriétaire (collision notée) :
 * c'est la page qui abrège, et aucun composant client ne reçoit le nom complet.
 */
const nomAffiche = (agent: AgentDto) =>
  estUnAgent(agent) ? agent.full_name : nomAbrege(agent.first_name, agent.last_name, agent.full_name);

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const t = await getTranslations('agents.publicPage');
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';
  const resultat = await getAgent(slug, brut);

  // ⚠️ **Cet appel ne porte AUCUN code HTTP** — le 404 vient du `notFound()` du corps de page.
  // Désagrégé le 2026-08-28 : `notFound()` dans le seul `generateMetadata` rend **200**, dans le
  // seul corps de page **404**. La mesure complète, et la raison pour laquelle cette ligne reste
  // malgré tout — elle est load-bearing pour les TYPES, `never` retirant `introuvable` de l'union
  // avant la lecture de `resultat.agent` —, sont écrites une seule fois, dans le commentaire
  // jumeau de `agencies/[slug]/page.tsx`.
  if (resultat.etat === 'introuvable') notFound();

  if (resultat.etat === 'indisponible') {
    return {
      title: t('unavailableTitle'),
      description: t('unavailableMetaDescription'),
      robots: { index: false },
    };
  }

  const agent = resultat.agent;
  const nom = nomAffiche(agent);
  const summary = agent.city
    ? t('metaSummaryInCity', { count: agent.portfolio_count, city: agent.city })
    : t('metaSummary', { count: agent.portfolio_count });
  // TCK-573 — un propriétaire garde sa fiche sous `/agents/…` mais n'y est jamais titré « agent
  // immobilier » : tout ce qui n'est pas explicitement `agent` est présenté comme propriétaire.
  const title = estUnAgent(agent) ? t('metaTitle', { name: nom }) : t('metaTitleOwner', { name: nom });
  // TCK-915 (P09.08) — la bio résumée au mot, et une bio vide prend le résumé.
  const description = resumePourMeta(agent.bio) ?? summary;
  return {
    title,
    description,
    // Canonique + hreflang, dérivés du même chemin (TCK-433). Un profil public n'a pas de
    // variante d'URL à replier ; sans canonique explicite, Next n'en émet simplement aucune.
    // TCK-2519 — le slug CANONIQUE servi par l'API, jamais celui de l'URL : une ancienne adresse
    // redirige (cf. la page), et ses métadonnées ne doivent pas se déclarer canoniques.
    alternates: alternatesPubliques(`/agents/${agent.slug}`, locale),
    openGraph: {
      title,
      description,
      images: agent.avatar_url ? [agent.avatar_url] : undefined,
    },
    // TCK-2506 — un propriétaire qui n'a pas choisi l'annuaire garde sa fiche (ses annonces y
    // mènent) mais elle n'est pas indexée. `follow` reste : ses annonces, elles, sont publiques.
    ...(agent.indexable === false ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * L'API n'a pas répondu — **et on ne dit surtout pas que l'agent n'existe pas.**
 *
 * ⚠️ Une FONCTION qui rend du JSX, non un composant asynchrone : sous jsdom, un composant `async`
 * imbriqué ne serait pas rendu, et le test d'AC2 ne verrait jamais cette branche.
 */
async function agentIndisponible() {
  const t = await getTranslations('agents.publicPage');

  return (
    <div className="min-h-screen bg-background">
      {/* TCK-2568 — la panne ouvre, au téléphone, sur la barre de MARQUE (écran « Erreur serveur »). */}
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

/** Les langues servies (`fr`, `wo`…) dans la langue de la page ; un code inconnu reste tel quel. */
function nomsDesLangues(codes: readonly string[], locale: string): string[] {
  // Sans annotation `Intl.DisplayNames` : `check-locale-figee` (contrôle D) lit un constructeur nommé
  // hors d'un appel comme un alias. La locale est celle de la page, jamais figée.
  const nommer = (() => {
    try {
      const noms = new Intl.DisplayNames([locale], { type: 'language' });
      return (code: string) => noms.of(code);
    } catch {
      return null;
    }
  })();
  return codes
    .map((code) => code.trim())
    .filter((code) => code !== '')
    .map((code) => {
      let nom: string | undefined;
      try {
        nom = nommer?.(code);
      } catch {
        nom = undefined;
      }
      const libelle = nom && nom !== code ? nom : code;
      return libelle.charAt(0).toLocaleUpperCase(locale) + libelle.slice(1);
    });
}

/**
 * TCK-2523 — la fiche publique d'une personne : **la personne d'abord, ses biens cherchables**
 * (maquette `?p=agent&a=d`).
 *
 * - Premier écran : photo ou initiales, nom, agence cliquable, note, délai de réponse, langues,
 *   quartiers, bio ; Appeler et Message (le formulaire anonyme reste la voie Message).
 * - Ses biens : la recherche de la fiche d'agence (TCK-2522) **au-delà de six biens seulement**
 *   (`aUneRecherche`) ; en dessous, le portefeuille Tous / À louer / À vendre d'avant. « Aucun bien »
 *   renvoie vers les biens de son agence, avec leur compte.
 * - Propriétaire sur option (décision 1b) : nom abrégé partout, AUCUN numéro (ni bouton, ni données
 *   structurées), et le contact renvoyé à l'agence qui gère ses biens quand elle est connue.
 *
 * **Rien de l'existant ne se perd** : retour, initiales en repli, qualité (agent / propriétaire),
 * ville, spécialité, zones, expérience, rattachement à l'agence, bio, compte de biens, portefeuille
 * avec « Voir plus », avis, état vide propre au propriétaire, vrai 404, état « indisponible »,
 * redirection permanente de l'ancienne adresse (TCK-2519), `noindex` hors annuaire (TCK-2506).
 */
export default async function Page({ params, searchParams }: Props) {
  const t = await getTranslations('agents.publicPage');
  const tRoles = await getTranslations('publicProfile.roles');
  const tProfil = await getTranslations('publicProfile');
  const { slug } = await params;
  const brutLocale = await getLocale();
  const locale = isLocale(brutLocale) ? brutLocale : 'fr';
  const resultat = await getAgent(slug, brutLocale);

  // Un 404 amont produit un VRAI 404 — statut compris.
  if (resultat.etat === 'introuvable') notFound();
  if (resultat.etat === 'indisponible') return agentIndisponible();

  const agent = resultat.agent;

  // TCK-2519 — une ancienne adresse (`username`, ancien slug au nom, autre casse) mène à la fiche
  // au nom. `canonical_slug` n'est servi que quand l'adresse demandée n'est pas la canonique, et la
  // comparaison au segment garde de toute boucle. ⚠ **308 et non 301** : c'est le seul code permanent
  // que Next rende depuis une page (`permanentRedirect`) ; un 301 exigerait un appel à l'API dans
  // `src/proxy.ts` pour CHAQUE fiche servie. Les moteurs traitent les deux à l'identique.
  if (agent.canonical_slug && agent.canonical_slug !== slug) {
    permanentRedirect(`/${locale}/agents/${encodeURIComponent(agent.canonical_slug)}`);
  }

  const stats = agent.stats;
  const reviews = agent.reviews;
  const estAgent = estUnAgent(agent);
  const nom = nomAffiche(agent);
  // TCK-633 (lot C, tour 3) — aucun numéro principal non vérifié n'est publié : la page ne le publie
  // qu'à `phone_verified === true` — un champ absent vaut « non ». TCK-2523 (1b) — et JAMAIS celui
  // d'un propriétaire : sa fiche ne porte aucun numéro personnel, vérifié ou non.
  const telephone = estAgent && agent.phone_verified === true ? agent.phone : null;
  const delai = delaiDeReponse(agent.median_response_minutes);
  const texteDelai = delai ? tProfil(`delai.${delai.unite}`, { n: delai.valeur }) : null;
  const langues = nomsDesLangues(agent.languages ?? [], locale);
  const quartiers = (agent.neighborhoods ?? []).map((q) => q.name.trim()).filter((q) => q !== '');
  const noteMoyenne = reviews && reviews.count > 0 && reviews.average !== null ? reviews.average : null;

  // L'agence qui reçoit le contact d'un propriétaire (1b). ⚠ Mesuré le 2026-11-09 : l'API rend
  // `agency: null` pour tout propriétaire (`User::agency` passe par le profil d'AGENT) — le renvoi ne
  // joue donc que quand elle saura la servir (TCK-2574). D'ici là, le formulaire anonyme, comme avant.
  const agenceDuProprietaire = !estAgent ? agent.agency : null;
  const message: CanalDeMessage = agenceDuProprietaire
    ? { genre: 'agence', nom: agenceDuProprietaire.name, slug: agenceDuProprietaire.slug }
    : { genre: 'formulaire', slug: agent.slug, role: estAgent ? 'agent' : 'owner' };

  // La recherche, au-delà de six biens seulement (AC1) : en dessous, aucun appel de plus.
  const avecRecherche = aUneRecherche(agent.portfolio_total);
  const portefeuille = avecRecherche
    ? await chargerPortefeuilleDeFiche({ agent: agent.slug }, (await searchParams) ?? {}, brutLocale)
    : null;

  // TCK-573 — la qualité de la personne ouvre l'eyebrow : « Propriétaire » ou « Agent
  // immobilier », jamais déduite de l'URL `/agents/…`.
  const eyebrowParts: string[] = [estAgent ? tRoles('agent') : tRoles('owner')];
  if (agent.city) eyebrowParts.push(agent.city);
  if (agent.specialty) eyebrowParts.push(agent.specialty);
  // TCK-1321 (P117.03) — les zones d'intervention, en lecture seule, à côté de la spécialité.
  if (agent.intervention_zones && agent.intervention_zones.length > 0) {
    eyebrowParts.push(agent.intervention_zones.join(', '));
  }
  if (agent.years_of_experience && agent.years_of_experience > 0) {
    eyebrowParts.push(t('experience', { count: agent.years_of_experience }));
  }

  // La ligne de confiance : note, délai, biens en ligne — chaque morceau seulement s'il existe (AC4).
  const confiance =
    noteMoyenne !== null || texteDelai || agent.portfolio_total > 0 ? (
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
        {noteMoyenne !== null && reviews ? (
          <span className="inline-flex items-center gap-1 text-foreground">
            <Star className="size-3.5 fill-primary text-primary" aria-hidden />
            <span className="font-semibold tabular-nums">{noteMoyenne.toFixed(1)}</span>
            <span className="tabular-nums text-muted-foreground">({reviews.count})</span>
          </span>
        ) : null}
        {texteDelai ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden /> {texteDelai}
          </span>
        ) : null}
        {agent.portfolio_total > 0 ? (
          <span>
            {t('enLigne', { count: agent.portfolio_total })}
            {stats && stats.rent_count > 0 ? (
              <>
                {' · '}
                <span className="tabular-nums">{stats.rent_count}</span> {t('forRent')}
              </>
            ) : null}
            {stats && stats.sale_count > 0 ? (
              <>
                {' · '}
                <span className="tabular-nums">{stats.sale_count}</span> {t('forSale')}
              </>
            ) : null}
            {stats && stats.cities > 0 ? <> · {t('citiesCount', { count: stats.cities })}</> : null}
          </span>
        ) : null}
      </p>
    ) : null;

  const encartAgence = agenceDuProprietaire ? (
    <div className="mt-4 flex items-start gap-3 rounded-2xl bg-muted p-3.5 lg:mt-0 lg:mb-3 lg:p-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground font-display text-xs font-semibold text-background" aria-hidden>
        {initiales(agenceDuProprietaire.name)}
      </span>
      <p className="text-[15px] leading-snug text-foreground">
        {t('proprietaire.gerePar', { agence: agenceDuProprietaire.name })}
        <LienLocalise
          href={`/agencies/${encodeURIComponent(agenceDuProprietaire.slug)}`}
          className="mt-1 flex items-center gap-1 font-medium underline underline-offset-4"
        >
          {t('proprietaire.voirAgence')} <ChevronRight className="size-4" aria-hidden />
        </LienLocalise>
      </p>
    </div>
  ) : null;

  const titreDesBiens = (
    <h2 key="titre" id="portfolio-heading" className="font-display text-lg font-semibold tracking-tight text-foreground lg:text-2xl">
      {t('sesBiens')}
    </h2>
  );

  return (
    // `max-lg:pb-20` : la barre d'actions fixée en bas ne recouvre pas le pied de page.
    <div className="min-h-screen bg-background max-lg:pb-20">
      {/*
        TCK-435 — le balisage n'affirme QUE ce que la page rend : la note agrégée n'est émise
        qu'au-dessus de zéro avis, la ville nulle ne devient pas la chaîne « null », et le
        contact ne dépasse pas ce que la page publie. TCK-2506 — aucune donnée structurée
        `Person` pour une fiche non indexable. TCK-2523 — le nom balisé est le nom AFFICHÉ.
      */}
      {agent.indexable !== false && (
        <DonneesStructurees donnees={jsonLdAgent({ ...agent, full_name: nom, phone: telephone }, locale)} />
      )}
      {/* TCK-2568 — au téléphone, PAS de barre du site : la fiche porte sa rangée « ← [partager] »
          (maquette `EnTete`). La règle centrale le dit aussi depuis la vague 3 ; la surcharge reste écrite ici. */}
      <Navbar auTelephone="en-tete-de-page" />
      <NavbarSpacer auTelephone="en-tete-de-page" />

      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="pb-32 focus:outline-none lg:pb-24">
        <div className="mx-auto grid max-w-[1280px] gap-x-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:pt-10">
          <div className="min-w-0">
            {/* En bureau, la barre du site reste ; le retour d'avant aussi. */}
            <BoutonRetour repli="/agents" libelle={t('back')} className="mb-6 hidden lg:inline-flex" />

            <EnTeteDeFiche nom={nom} repli="/agents" variante="barre" rappel={t('biensDe', { nom })}>
              <section aria-labelledby="identite-heading" className="pt-2 lg:pt-0">
                <div className="flex items-center gap-4 lg:gap-6">
                  <div className="relative size-[72px] shrink-0 overflow-hidden rounded-full border border-border bg-secondary lg:size-28">
                    {agent.avatar_url ? (
                      <Image src={agent.avatar_url} alt={nom} fill sizes="112px" className="object-cover" priority />
                    ) : (
                      <span className="flex size-full items-center justify-center font-display text-xl text-primary-deep lg:text-3xl" aria-hidden>
                        {initiales(nom)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrowParts.join(' · ')}</p>
                    <h1
                      id="identite-heading"
                      className="mt-1 font-display text-[26px] font-semibold leading-tight tracking-tight text-foreground text-balance lg:text-[40px] lg:leading-none"
                    >
                      {nom}
                    </h1>
                    {estAgent && agent.agency ? (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[15px] text-muted-foreground lg:mt-2">
                        <Building2 className="size-4" aria-hidden />
                        <span>
                          {t('agentAt')}{' '}
                          <LienLocalise
                            href={`/agencies/${encodeURIComponent(agent.agency.slug)}`}
                            className="font-medium text-foreground underline underline-offset-4"
                          >
                            {agent.agency.name}
                          </LienLocalise>
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>

                {confiance}

                {langues.length > 0 || quartiers.length > 0 ? (
                  <div className="mt-4 space-y-2.5 lg:flex lg:flex-wrap lg:items-center lg:gap-x-8 lg:space-y-0">
                    {langues.length > 0 ? (
                      <div className="flex items-start gap-2.5 text-[15px]">
                        <Languages className="mt-1.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <ul aria-label={t('langues')} className="flex flex-wrap gap-1.5">
                          {langues.map((langue) => (
                            <li key={langue} className="inline-flex h-7 items-center rounded-full bg-secondary px-2.5 text-[13px] font-medium text-primary-deep">
                              {langue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {quartiers.length > 0 ? (
                      <p className="flex items-start gap-2.5 text-[15px] text-foreground">
                        <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span>
                          <span className="sr-only">{t('quartiers')} : </span>
                          {quartiers.join(', ')}
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {!estAgent ? (
                  <>
                    <div className="lg:hidden">{encartAgence}</div>
                    <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground lg:text-sm">
                      <ShieldCheck className="size-3.5 shrink-0" aria-hidden /> {t('proprietaire.note')}
                    </p>
                  </>
                ) : null}

                {agent.bio ? (
                  <p className="mt-4 line-clamp-4 max-w-[65ch] text-[15px] leading-relaxed text-muted-foreground lg:mt-5 lg:line-clamp-none lg:text-[17px]">
                    {agent.bio}
                  </p>
                ) : null}
              </section>
            </EnTeteDeFiche>

            {/* Ses biens — cherchables au-delà de six (AC1), sinon le portefeuille d'avant. */}
            <section aria-labelledby="portfolio-heading" className="mt-8 lg:mt-10">
              {portefeuille ? (
                <RechercheDuPortefeuille
                  graine={portefeuille.graine}
                  fixes={portefeuille.fixes}
                  total={portefeuille.total}
                  nom={nom}
                  collerSous="en-tete"
                  agence={estAgent && agent.agency ? { nom: agent.agency.name, slug: agent.agency.slug } : null}
                  titre={titreDesBiens}
                />
              ) : (
                <>
                  <div className="mb-4">{titreDesBiens}</div>
                  {agent.portfolio.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card p-10 text-center">
                      <Building2 className="mx-auto size-6 text-muted-foreground" aria-hidden />
                      <p className="mt-3 font-display text-xl text-foreground">{t('emptyTitle')}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{estAgent ? t('emptyBody') : t('emptyBodyOwner')}</p>
                    </div>
                  ) : (
                    <PortfolioTabs
                      portfolio={agent.portfolio}
                      source={{ kind: 'agent', slug: agent.slug }}
                      totals={{
                        all: agent.portfolio_total,
                        rent: stats?.rent_count ?? 0,
                        sale: stats?.sale_count ?? 0,
                      }}
                    />
                  )}
                </>
              )}
            </section>

            {/* Avis */}
            {reviews ? (
              <div className="mt-12">
                <ReviewsSection average={reviews.average} count={reviews.count} reviews={reviews.recent} />
              </div>
            ) : null}
          </div>

          {/* Bureau : l'encart de l'agence (propriétaire) puis la carte de contact, collants. Au
              téléphone, la carte devient la barre d'actions fixée en bas (ADR-0091 § 4). */}
          <aside className="lg:sticky lg:top-[96px] lg:self-start">
            <div className="hidden lg:block">{encartAgence}</div>
            <ContactDeFiche
              nom={nom}
              telephone={telephone}
              message={message}
              sousTitre={texteDelai}
            />
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
