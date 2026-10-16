'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { MessagesSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/console';
import { usePropertyConversation } from '@/lib/queries/conversations';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';
import { PropertyDraftChatView } from './PropertyDraftChatView';
import { NewGroupDialog } from './NewGroupDialog';
import { usePeutProposerUnGroupe } from './espaceActif';

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
  /** Le dernier geste qui a fait passer de la liste à la conversation, ou l'inverse. */
  const [transition, setTransition] = useState<'aller' | 'retour' | null>(null);
  const peutCreerGroupe = usePeutProposerUnGroupe();

  const { data: resolution } = usePropertyConversation(propertySlug);
  const bien = resolution?.data ?? null;

  const brouillon =
    choix === undefined && bien && bien.can_message && bien.conversation_id === null ? bien : null;
  // Un choix explicite dans la liste l'emporte toujours sur ce que l'URL avait amené.
  const conversationAffichee = choix !== undefined ? choix : (bien?.conversation_id ?? null);

  const compact = useMatchesMaxWidth(LG_BREAKPOINT_PX - 1);
  const panneauOuvert = brouillon !== null || conversationAffichee !== null;
  const afficheListe = !compact || !panneauOuvert;
  const affichePanneau = !compact || panneauOuvert;
  /** Le retour n'existe que là où il a un sens : au-dessus de `lg`, la liste n'a jamais disparu. */
  const retourALaListe = compact
    ? () => {
        setTransition('retour');
        setChoix(null);
      }
    : undefined;

  function choisir(id: number): void {
    setChoix(id);
  }

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
   * haute en `h-14`. Les marges négatives et les `calc` ci-dessous en sont le miroir exact ; si la
   * coque change de gouttière, ils changent avec elle. Au-dessus de `lg`, rien de tout cela :
   * la page garde son en-tête et sa carte d'avant.
   */
  const cadre = enConversation
    ? '-mx-4 -my-6 h-[calc(100dvh-3.5rem)] md:-mx-6 md:-my-8 md:h-[calc(100dvh-3.5rem)]'
    : '-mx-4 -mb-6 h-[calc(100dvh-5rem)] md:-mx-6 md:-mb-8 md:h-[calc(100dvh-5.5rem)]';

  return (
    <>
      <div
        data-testid="messagerie"
        className={cn(
          'flex min-h-[24rem] flex-col lg:mx-0 lg:my-0 lg:block lg:h-auto lg:min-h-0 lg:space-y-6',
          cadre,
        )}
      >
        {/*
          Deux en-têtes, un seul visible. Au-dessus de `lg`, celui de la console, inchangé. En
          dessous, l'empilement titre / sous-titre / carte / barre « Conversations » (relevé du
          porteur à 390 px) devient UNE ligne : le titre et l'action. Le sous-titre « Vos
          conversations » y redisait le titre, et la barre de la liste le redisait une troisième
          fois. Il disparaît quand une conversation occupe l'écran : elle a son propre en-tête,
          avec son retour.
        */}
        <div data-testid="messagerie-entete-bureau" className="hidden lg:block">
          <PageHeader title={titre} description={sousTitre} />
        </div>
        {afficheListe && (
          <header
            data-testid="messagerie-entete-compact"
            className={cn('flex items-center justify-between gap-3 px-4 pb-3 lg:hidden', entreeListe)}
          >
            <h1 className="min-w-0 truncate font-display text-2xl font-bold tracking-tight text-foreground">
              {titre}
            </h1>
            {peutCreerGroupe && (
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 rounded-full"
                onClick={() => setGroupOpen(true)}
                data-testid="new-group-button-compact"
              >
                <Plus className="size-4" aria-hidden />
                {t('newGroup')}
              </Button>
            )}
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
          className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden border-t border-border bg-card lg:h-[calc(100dvh-12rem)] lg:min-h-[24rem] lg:rounded-xl lg:border lg:grid-cols-[320px_1fr]"
        >
          {afficheListe && (
            <aside className={cn('flex min-h-0 min-w-0 flex-col lg:border-r lg:border-border', entreeListe)}>
              <div
                data-testid="messagerie-barre-liste"
                className="hidden items-center justify-between gap-2 border-b border-border py-2 pl-4 pr-2 lg:flex"
              >
                <h2 className="text-sm font-semibold text-foreground">{t('listHeading')}</h2>
                {peutCreerGroupe && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setGroupOpen(true)}
                    data-testid="new-group-button"
                  >
                    <Plus className="mr-1 size-4" aria-hidden />
                    {t('newGroup')}
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <ConversationList selectedId={conversationAffichee} onSelect={ouvrirDepuisLaListe} />
              </div>
            </aside>
          )}
          {affichePanneau && (
            <section className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden', entreePanneau)}>
              {brouillon ? (
                <PropertyDraftChatView
                  property={brouillon.property}
                  recipientName={brouillon.recipient?.name ?? null}
                  recipientAvatarUrl={brouillon.recipient?.avatar_url ?? null}
                  onBack={retourALaListe}
                  onCreated={choisir}
                />
              ) : conversationAffichee ? (
                <ChatView conversationId={conversationAffichee} onBack={retourALaListe} />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/50 p-8 text-center text-sm text-pretty text-muted-foreground">
                  <MessagesSquare className="size-8 text-muted-foreground/70" aria-hidden />
                  {t('emptyState')}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      {/*
        Hors de la grille, délibérément : en `grid-cols-1` un troisième enfant deviendrait une
        deuxième RANGÉE et volerait la moitié de la hauteur au fil, y compris dialogue fermé.
      */}
      <NewGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} onCreated={choisir} />
    </>
  );
}
