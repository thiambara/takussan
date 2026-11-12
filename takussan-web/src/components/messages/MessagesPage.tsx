'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { MessagesSquare, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useConversationsInfinite,
  usePropertyConversation,
  type MessagingContact,
} from '@/lib/queries/conversations';
import { useMatchesMaxWidth, useMatchesMedia } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';
import { ConversationList } from './ConversationList';
import { EtatVideDeLaMessagerie } from './EtatVideDeLaMessagerie';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { ChatView } from './ChatView';
import { PropertyDraftChatView } from './PropertyDraftChatView';
import { NewGroupDialog } from './NewGroupDialog';
import { NouvelleConversation } from './NouvelleConversation';
import { BrouillonDirect } from './BrouillonDirect';
import { usePeutProposerUnGroupe } from './espaceActif';
import { ColonneDeContexte } from './ColonneDeContexte';
import { FeuilleDuFil } from './FeuilleDuFil';

/**
 * Point de rupture `lg` de Tailwind (TCK-501, déplacé de `md` à `lg` par TCK-505 #4). La même
 * valeur gouverne la classe CSS (`lg:grid-cols-[320px_1fr]`) et le gate JS ci-dessous : les
 * deux couches doivent basculer au même pixel, sinon il existe une largeur où le CSS montre
 * deux colonnes et le JS n'en remplit qu'une.
 *
 * ⚠️ Pourquoi `lg` et non `md` : entre 768 et 1023 px la coque `/app` montre déjà sa barre
 * latérale de 256 px. Une grille `320px 1fr` dans les ≈ 464 px restants laissait ≈ 150 px au
 * fil et au composeur — des bulles d'un mot par ligne, mesurées le 2026-09-02 sur tablette en
 * portrait. `md` n'est pas « bureau » dans `/app`.
 */
const LG_BREAKPOINT_PX = 1024;

/**
 * Two-pane messaging layout: conversation list on the left, active chat on
 * the right. Selection is held locally; the initial value can be seeded
 * from a `?conversation=ID` query param (TCK-274) so the floating chat
 * widget can deep-link into this page (mobile FAB, "Manage group" link).
 *
 * TCK-500 — second point d'entrée : `?property=<slug>`, posé par la fiche d'un bien EN DESSOUS
 * du point de rupture `md`, où le panneau flottant ne tient pas. La page résout elle-même le
 * bien et ouvre soit le fil existant, soit un fil qui n'existe pas encore avec son brouillon.
 *
 * ⚠️ **L'URL ne porte que le slug, jamais le texte du message.** Le brouillon est reconstruit
 * ICI, dans la locale de la page. Un `?draft=<texte>` aurait été plus simple à écrire et aurait
 * laissé n'importe qui forger un lien qui pré-remplit une phrase dans le composeur d'un tiers.
 *
 * TCK-501 — **sous le point de rupture, la page montre UNE chose à la fois** : la liste, ou la conversation
 * avec un retour vers la liste. Les deux panneaux tenaient jusque-là dans une grille
 * `320px 1fr` sans variante mobile : à 390 px de large il restait 70 px pour le fil et le
 * composeur, qui se coupaient en une colonne d'un mot par ligne.
 *
 * ⚠️ Le partage n'est PAS fait en cachant un panneau en CSS. Les deux panneaux montent chacun
 * un sondage réseau — `ConversationList` toutes les 10 s, `ChatView` toutes les 3 s — et un
 * `hidden` les laisserait tourner tous les deux sur un téléphone. Le gate est donc en JS, sur
 * la MÊME valeur de point de rupture que la classe Tailwind ci-dessus.
 */
interface MessagesPageProps {
  /** Titre et sous-titre de la page, déjà traduits par la page serveur (`dashboard.pages.messages`). */
  readonly titre: string;
  readonly sousTitre: string;
}

/**
 * Easing standard de la charte (`docs/design-guidelines.md`, « Animations standard »).
 * L'entrée n'existe que sous le point de rupture, là où la liste et la conversation se REMPLACENT :
 * au pouce, la conversation arrive du côté où l'on lit la suite, et la liste revient en fondu. Elle
 * ne joue que sur un geste (`transition`), jamais au premier rendu — après l'hydratation, `compact`
 * passe de `false` à `true` sur un élément déjà monté, et une classe d'animation posée à ce
 * moment-là la ferait jouer au chargement de la page.
 */
const ENTREE_CONVERSATION =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]';
const ENTREE_LISTE = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200';

export function MessagesPage({ titre, sousTitre }: MessagesPageProps) {
  const t = useTranslations('messaging');
  const searchParams = useSearchParams();
  const initialId = (() => {
    const raw = searchParams?.get('conversation');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  const propertySlug = searchParams?.get('property') || null;

  /**
   * Trois états, pas deux — et le troisième est ce que TCK-501 avait besoin d'exprimer.
   *
   *   · `undefined` — aucun choix explicite : on suit ce que l'URL a amené (`?conversation=`
   *     ou la résolution de `?property=`), brouillon compris ;
   *   · un nombre   — une conversation choisie, dans la liste ou à la naissance d'un fil ;
   *   · `null`      — « retour à la liste », qui est un choix lui aussi et doit donc l'emporter
   *     sur l'URL. Sans lui, le bouton retour d'un lien `?conversation=42` rendait la main à
   *     l'URL, qui rouvrait aussitôt la même conversation : le cul-de-sac de la contrainte 1.
   *
   * Il remplace le booléen `brouillonEcarte` : « un choix a été fait » et « le brouillon est
   * écarté » sont le même fait, et deux états pour un fait finissent par se contredire.
   */
  const [choix, setChoix] = useState<number | null | undefined>(initialId ?? undefined);
  const [groupOpen, setGroupOpen] = useState(false);
  /** TCK-2632 — « Nouvelle conversation », et la personne SANS fil qu'on y a choisie (AC4). */
  const [nouvelleOuverte, setNouvelleOuverte] = useState(false);
  const [brouillonDirect, setBrouillonDirect] = useState<MessagingContact | null>(null);
  /** Le dernier geste qui a fait passer de la liste à la conversation, ou l'inverse. */
  const [transition, setTransition] = useState<'aller' | 'retour' | null>(null);
  const peutCreerGroupe = usePeutProposerUnGroupe();

  const { data: resolution } = usePropertyConversation(propertySlug);
  const bien = resolution?.data ?? null;

  const compact = useMatchesMaxWidth(LG_BREAKPOINT_PX - 1);
  /**
   * TCK-2632 — « au bureau » se lit en POSITIF : la requête rend `false` au serveur et pendant
   * l'hydratation, et ne passe à `true` qu'une fois le navigateur mesuré. `!compact`, lui, vaut
   * `true` à ce moment-là — sur un téléphone aussi —, et l'arrivée ci-dessous y aurait ouvert un fil.
   */
  const bureau = useMatchesMedia(`(min-width: ${LG_BREAKPOINT_PX}px)`);
  // La même requête que la liste sans filtre (même clé) : rien de plus ne part.
  const { data: listeSansFiltre } = useConversationsInfinite();
  const premierePage = listeSansFiltre?.pages[0];

  /**
   * TCK-2632 (AC5) — au bureau, l'arrivée ouvre le fil non lu le plus récent (à défaut, le plus
   * récent) au lieu d'un panneau vide. Un VERROU, posé une seule fois : ouvrir le fil le marque lu,
   * et la relecture de la liste toutes les 10 s changerait « le plus récent non lu » sous les yeux
   * de la personne. Jamais quand l'URL a amené un fil (`?conversation=`, `?property=`), ni après un
   * choix, ni au téléphone.
   */
  const [arrivee, setArrivee] = useState<number | null | undefined>(undefined);
  if (arrivee === undefined && bureau && premierePage) {
    const sansConsigne = choix === undefined && initialId === null && propertySlug === null;
    const fils = premierePage.data;
    setArrivee(sansConsigne ? ((fils.find((c) => (c.unread_count ?? 0) > 0) ?? fils[0])?.id ?? null) : null);
  }

  const brouillon =
    choix === undefined && bien && bien.can_message && bien.conversation_id === null ? bien : null;
  // Un choix explicite dans la liste l'emporte toujours sur ce que l'URL avait amené.
  const conversationAffichee = choix !== undefined ? choix : (bien?.conversation_id ?? arrivee ?? null);
  /** La colonne de contexte du bureau (dès `xl`), repliable depuis l'en-tête du fil. */
  const [contexteOuvert, setContexteOuvert] = useState(true);
  /** TCK-2632 (maquette a/2) — au téléphone, la feuille du fil que « ⋯ » d'un fil direct ouvre. */
  const [feuilleDuFil, setFeuilleDuFil] = useState(false);
  const contexte = { ouvert: contexteOuvert, onBasculer: () => setContexteOuvert((o) => !o) };
  const comptes = premierePage?.meta.counts;
  const sousTitreBureau = comptes
    ? comptes.all === 0
      ? t('bureau.aucune')
      : t('bureau.sousTitre', { nonLues: comptes.unread, total: comptes.all })
    : sousTitre;
  const panneauOuvert = brouillonDirect !== null || brouillon !== null || conversationAffichee !== null;
  const afficheListe = !compact || !panneauOuvert;
  const affichePanneau = !compact || panneauOuvert;
  /** Le retour n'existe que là où il a un sens : au-dessus de `lg`, la liste n'a jamais disparu. */
  const retourALaListe = compact
    ? () => {
        setTransition('retour');
        setBrouillonDirect(null);
        setChoix(null);
      }
    : undefined;

  function choisir(id: number): void {
    setBrouillonDirect(null);
    setChoix(id);
  }

  function ouvrirUnBrouillon(personne: MessagingContact): void {
    setTransition('aller');
    setBrouillonDirect(personne);
  }

  const ouvrirNouvelle = () => setNouvelleOuverte(true);

  function ouvrirDepuisLaListe(id: number): void {
    setTransition('aller');
    choisir(id);
  }

  const enConversation = compact && panneauOuvert;
  const entreeListe = compact && transition === 'retour' ? ENTREE_LISTE : '';
  const entreePanneau = compact && transition === 'aller' ? ENTREE_CONVERSATION : '';
  /**
   * TCK-645 — sous `lg`, la page déborde la gouttière de la coque pour que la liste occupe la
   * largeur de l'écran, et descend jusqu'à son bord bas ; une conversation ouverte remonte aussi
   * jusqu'à la barre haute (`h-14`), comme dans une application de messagerie.
   *
   * ⚠ Couplage assumé avec le `<main>` d'`AppShell` : `px-4 py-6 md:px-6 md:py-8` et la barre
   * haute en `h-14` ; sous `md`, la barre d'onglets de la coque (`--barre-onglets-hauteur`,
   * TCK-2481), sœur du `<main>` : le `<main>` rétrécit de sa hauteur, le cadre s'en retire aussi,
   * sans quoi le composeur passe sous le pli. Dès `md`, pas de barre : rien à retirer. Les marges
   * négatives et les `calc` ci-dessous en sont le miroir exact ; si la coque change de gouttière,
   * ils changent avec elle. Au-dessus de `lg`, rien de tout cela : la page garde son en-tête et sa
   * carte d'avant.
   */
  // TCK-2617 — une conversation ouverte prend tout l'écran du téléphone : la coque n'y rend ni son
  // en-tête ni sa barre d'onglets (déclaré ci-dessous) ; le cadre n'en retire donc plus rien.
  const cadre = enConversation
    ? '-mx-4 -my-6 h-dvh md:-mx-6 md:-my-8 md:h-[calc(100dvh-var(--spacing)*14)]'
    : // TCK-2632 — au téléphone, la liste commence sous l'en-tête de la coque (maquette : le champ à
      // 12 px du filet), sans la marge haute de l'enveloppe (`py-6`) : le cadre la reprend.
      '-mx-4 -my-6 h-[calc(100dvh-var(--spacing)*14-var(--barre-onglets-hauteur))] md:-mx-6 md:mt-0 md:-mb-8 md:h-[calc(100dvh-var(--spacing)*22)]';

  return (
    <>
      {/* TCK-2617 — l'ÉTAT de la page, pas sa route : `?conversation=…` ne change pas le chemin. */}
      {/* TCK-2632 — sous `md`, « Nouvelle conversation » est l'action de la page racine (TCK-2617). */}
      <DeclarerEnTete
        // TCK-2632 — au téléphone, la page porte le nom de son onglet (« Messages », TCK-2618) ; la
        // colonne du bureau garde « Messagerie », comme la maquette.
        titre={t('titreTelephone')}
        conversation={enConversation}
        action={
          enConversation ? undefined : (
            <ActionDEnTete libelle={t('nouvelle.titre')} icone={<SquarePen className="size-5" aria-hidden />} onClick={ouvrirNouvelle} primaire />
          )
        }
      />
      <div
        data-testid="messagerie"
        className={cn(
          'flex min-h-96 flex-col',
          cadre,
          // TCK-2632 — au bureau aussi, la messagerie occupe toute la zone de contenu (maquette
          // `CadreBureau`) : elle déborde la marge de l'enveloppe (`lg:px-8`, `md:py-8`) et tient
          // l'écran — pas d'en-tête de coque dès `md` —, en colonnes qui défilent chacune.
          'lg:-mx-8 lg:-my-8 lg:h-dvh lg:min-h-0',
        )}
      >
        {/*
          Entre `md` et `lg`, UNE ligne : le titre et l'action (sous `md`, l'en-tête de la coque les
          porte). Au bureau, le titre vit en tête de la colonne de liste (TCK-2632 : un seul titre,
          plus « Messagerie / Vos conversations / Conversations »). Il disparaît quand une
          conversation occupe l'écran : elle a son propre en-tête, avec son retour.
        */}
        {afficheListe && (
          <header
            data-testid="messagerie-entete-compact"
            // Sous `md`, l'en-tête de la coque porte le titre ET l'action : celui-ci n'existe qu'entre
            // `md` et `lg` (rail de la coque, pas d'en-tête mobile).
            className={cn('flex items-center justify-between gap-3 px-4 pb-3 max-md:hidden lg:hidden', entreeListe)}
          >
            <h1 className="min-w-0 truncate font-display text-2xl font-bold tracking-tight text-foreground">
              {titre}
            </h1>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 rounded-full"
              onClick={ouvrirNouvelle}
              data-testid="nouvelle-conversation-compact"
            >
              <SquarePen className="size-4" aria-hidden />
              {t('nouvelle.bouton')}
            </Button>
          </header>
        )}
        {/*
          La hauteur est en `dvh`, pas en `vh` (TCK-501, contrainte 2) : sur un téléphone la barre
          d'adresse fait varier `100vh`, qui vaut la hauteur BARRE RÉTRACTÉE. Le composeur — la
          dernière ligne de l'écran — passait donc sous le pli tant que la barre était déployée.
          `dvh` suit le viewport réellement visible ; `min-h` garde un fil lisible en paysage, où
          la soustraction de 12rem ne laisserait presque rien. Sous `lg` (TCK-645), c'est le cadre
          ci-dessus qui porte la hauteur, et la grille le remplit (`flex-1`).

          `grid-rows-[minmax(0,1fr)]` + `min-h-0` (revue design 2026-09-16) : sans eux, la rangée
          implicite prenait la hauteur de son CONTENU. Mesuré à 1366 avec 22 conversations : la liste
          mesurait 1429 px pour une grille de 707 px, sans défilement possible (scrollHeight =
          clientHeight) — les conversations 11 à 22 étaient inatteignables — et le composeur d'une
          conversation ouverte tombait à y = 1631, sous le `overflow-hidden` de la grille.

          TCK-645 — la carte arrondie et bordée n'existe qu'à partir de `lg`. En dessous, la liste
          est la surface elle-même, d'un bord à l'autre de l'écran, sous un simple filet.
        */}
        <div
          data-testid="messagerie-grille"
          // TCK-2632 — au bureau, trois colonnes (liste · fil · contexte), sans carte : la liste à
          // 340 px (94,4 pas de 3,6 px), réduite avec la largeur dès `xl` pour que le fil garde le
          // nom de la personne (maquette : « pleins à 1440, ≈ 295 à 1280 ») ; le contexte dès `xl`.
          className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden bg-background md:border-t md:border-border lg:flex lg:border-t-0"
        >
          {afficheListe && (
            <aside
              className={cn(
                'flex min-h-0 min-w-0 flex-col lg:w-[calc(var(--spacing)*94.4)] lg:flex-none lg:border-r lg:border-border xl:w-[min(calc(var(--spacing)*94.4),29.3%)]',
                entreeListe,
              )}
            >
              <div data-testid="messagerie-entete-bureau" className="hidden flex-none px-4 pt-6 pb-3 lg:block">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate font-display text-2xl font-semibold tracking-titre text-foreground">
                      {titre}
                    </h1>
                    <p className="mt-0.5 truncate text-ui tabular-nums text-muted-foreground">{sousTitreBureau}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={ouvrirNouvelle}
                    data-testid="nouvelle-conversation-bureau"
                  >
                    <SquarePen className="size-4" aria-hidden />
                    {t('nouvelle.bouton')}
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ConversationList selectedId={conversationAffichee} onSelect={ouvrirDepuisLaListe} dense={!compact} onNouvelle={ouvrirNouvelle} />
              </div>
            </aside>
          )}
          {affichePanneau && (
            <section className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden lg:flex-1', entreePanneau)}>
              {brouillonDirect ? (
                <BrouillonDirect
                  key={brouillonDirect.id}
                  personne={brouillonDirect}
                  onBack={retourALaListe}
                  onCreated={choisir}
                />
              ) : brouillon ? (
                <PropertyDraftChatView
                  property={brouillon.property}
                  recipientName={brouillon.recipient?.name ?? null}
                  recipientAvatarUrl={brouillon.recipient?.avatar_url ?? null}
                  onBack={retourALaListe}
                  onCreated={choisir}
                />
              ) : conversationAffichee ? (
                <ChatView
                  conversationId={conversationAffichee}
                  onBack={retourALaListe}
                  contexte={bureau ? contexte : undefined}
                  onPlusDActions={compact ? () => setFeuilleDuFil(true) : undefined}
                />
              ) : !compact && comptes?.all === 0 ? (
                // TCK-2632 (a-4 bureau) — une messagerie sans aucun fil : le panneau dit d'où
                // vient une conversation, au lieu de « Sélectionnez une conversation ».
                <EtatVideDeLaMessagerie bureau onNouvelle={ouvrirNouvelle} />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/50 p-8 text-center text-sm text-pretty text-muted-foreground">
                  <MessagesSquare className="size-8 text-muted-foreground/70" aria-hidden />
                  {t('emptyState')}
                </div>
              )}
            </section>
          )}
          {bureau && !brouillonDirect && !brouillon && conversationAffichee ? (
            <ColonneDeContexte
              conversationId={conversationAffichee}
              ouverte={contexteOuvert}
              onOuvrir={() => setContexteOuvert(true)}
            />
          ) : null}
        </div>
      </div>
      {/*
        Hors de la grille, délibérément : en `grid-cols-1` un troisième enfant deviendrait une
        deuxième RANGÉE et volerait la moitié de la hauteur au fil, y compris dialogue fermé.
      */}
      {compact && conversationAffichee && !brouillonDirect && !brouillon ? (
        <FeuilleDuFil conversationId={conversationAffichee} open={feuilleDuFil} onOpenChange={setFeuilleDuFil} />
      ) : null}
      <NewGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} onCreated={choisir} />
      <NouvelleConversation
        open={nouvelleOuverte}
        onClose={() => setNouvelleOuverte(false)}
        onOuvrir={ouvrirDepuisLaListe}
        onBrouillon={ouvrirUnBrouillon}
        onNouveauGroupe={peutCreerGroupe ? () => setGroupOpen(true) : undefined}
      />
    </>
  );
}
