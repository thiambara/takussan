'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePropertyConversation } from '@/lib/queries/conversations';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';
import { PropertyDraftChatView } from './PropertyDraftChatView';
import { NewGroupDialog } from './NewGroupDialog';

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
export function MessagesPage() {
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
  const retourALaListe = compact ? () => setChoix(null) : undefined;

  function choisir(id: number): void {
    setChoix(id);
  }

  return (
    <>
      {/*
        La hauteur est en `dvh`, pas en `vh` (TCK-501, contrainte 2) : sur un téléphone la barre
        d'adresse fait varier `100vh`, qui vaut la hauteur BARRE RÉTRACTÉE. Le composeur — la
        dernière ligne de l'écran — passait donc sous le pli tant que la barre était déployée.
        `dvh` suit le viewport réellement visible ; `min-h` garde un fil lisible en paysage, où
        la soustraction de 12rem ne laisserait presque rien.
      */}
      <div
        data-testid="messagerie-grille"
        className="grid h-[calc(100dvh-12rem)] min-h-[24rem] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[320px_1fr]"
      >
        {afficheListe && (
          <aside className="flex min-w-0 flex-col lg:border-r lg:border-border">
            <div className="flex items-center justify-between border-b border-border p-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{t('listHeading')}</h2>
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
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationList selectedId={conversationAffichee} onSelect={choisir} />
            </div>
          </aside>
        )}
        {affichePanneau && (
          <section className="flex min-w-0 flex-col overflow-hidden">
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
              <div className="flex flex-1 items-center justify-center bg-muted/50 p-8 text-center text-sm text-muted-foreground">
                {t('emptyState')}
              </div>
            )}
          </section>
        )}
      </div>
      {/*
        Hors de la grille, délibérément : en `grid-cols-1` un troisième enfant deviendrait une
        deuxième RANGÉE et volerait la moitié de la hauteur au fil, y compris dialogue fermé.
      */}
      <NewGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} onCreated={choisir} />
    </>
  );
}
