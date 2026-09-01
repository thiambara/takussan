'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageSquare, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatView } from '@/components/messages/ChatView';
import { PropertyDraftChatView } from '@/components/messages/PropertyDraftChatView';
import { useChatDraft } from '@/context/ChatDraftContext';
import { useFloatingDockSlot } from '@/components/floating-dock';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';
import { useUnreadCount } from './useUnreadCount';

/** Tailwind `md` breakpoint — desktop launcher visible at >= 768px. */
const MD_BREAKPOINT_PX = 768;

/**
 * Static logical heights of the chat launchers, used by the FloatingDock to
 * decide where neighbouring slots stack. We intentionally measure only the
 * pill (not the open panel) so the comparator pill above us doesn't jump
 * 500 px when the user toggles the chat — standard Messenger / Intercom UX.
 */
const CHAT_LAUNCHER_DESKTOP_HEIGHT_PX = 56; // size-14
const CHAT_FAB_MOBILE_HEIGHT_PX = 48; // size-12

/**
 * TCK-274 — Floating messaging widget mounted once at the root layout.
 *
 * Visibility: rendered only for authenticated users, hidden on `/auth/*`,
 * `/onboarding/*`, `/maintenance`, and `/app/messages` (which already shows
 * the dedicated inbox).
 *
 * UX:
 *   - Desktop (≥ md): pill-shaped launcher bottom-right opens a 360 × 520
 *     panel that holds the conversation list and, on selection, a compact
 *     `ChatView` (`variant="widget"`). One conversation open at a time.
 *   - Mobile (< md): the desktop launcher is hidden via Tailwind, replaced
 *     by a circular FAB that simply navigates to `/app/messages`.
 *
 * Polling: this component does not introduce any new query — `ConversationList`
 * already polls every 10 s through `useConversations`, and `ChatView` polls
 * the open conversation every 3 s. The shared React Query cache means the
 * `/app/messages` page sees the same data with no duplicate network traffic.
 */
export function ChatWidget() {
  const t = useTranslations('messaging.widget');
  const pathname = usePathname() ?? '/';
  const { user } = useAuth();
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  /**
   * TCK-500 — la discussion demandée depuis la fiche d'un bien.
   *
   * ⚠️ **La cible est DÉRIVÉE au rendu, jamais recopiée dans un état local par un effet.**
   * La version qui la recopiait était refusée par `react-hooks/set-state-in-effect`, et la
   * règle avait raison sur le fond : deux sources pour un même fait — le contexte et l'état
   * local — se désynchronisent dès qu'on ferme le panneau sans vider l'une des deux. Ici la
   * cible EST la vérité, et fermer le panneau la consomme.
   *
   * `brouillon` ne vaut QUE pour « le fil n'existe pas encore ». Quand la résolution a trouvé un
   * fil, on ouvre `ChatView` dessus : le brouillon ouvre une discussion, il n'en continue pas
   * une, et retrouver « Bonjour, je suis intéressé(e) par… » au quatrième échange avec le même
   * agent serait absurde.
   */
  const chatDraft = useChatDraft();
  const cible = chatDraft?.cible ?? null;
  const consommerCible = chatDraft?.consommerCible;
  const brouillon = cible && cible.conversation_id === null ? cible : null;
  const conversationAffichee = cible?.conversation_id ?? selectedId;

  /** Le panneau est ouvert soit par le lanceur, soit parce qu'une fiche a demandé une discussion. */
  const panelOpen = open || cible !== null;

  /** Referme et remet à zéro les deux sources. Un brouillon non envoyé est perdu, délibérément. */
  const fermerPanneau = useCallback(() => {
    setOpen(false);
    setSelectedId(null);
    consommerCible?.();
  }, [consommerCible]);

  /**
   * « Retour » revient à la LISTE, il ne referme pas le panneau.
   *
   * ⚠️ `setOpen(true)` n'est pas redondant : quand le panneau a été ouvert depuis la fiche d'un
   * bien, `open` est resté `false` et c'est la cible seule qui le tenait ouvert. Consommer la
   * cible sans lever `open` faisait donc disparaître le panneau entier sur un clic qui promet
   * de reculer d'un cran.
   */
  const retourALaListe = useCallback(() => {
    setOpen(true);
    setSelectedId(null);
    consommerCible?.();
  }, [consommerCible]);

  // Restore focus to the launcher on close (a11y).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !panelOpen) {
      launcherRef.current?.focus();
    }
    wasOpenRef.current = panelOpen;
  }, [panelOpen]);

  // Escape closes the panel (a11y).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermerPanneau();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, fermerPanneau]);

  // Visibility gates — derived booleans first so we can wire them into the
  // FloatingDock `enabled` flag without violating the Rules of Hooks (hooks
  // must run unconditionally on every render).
  const isHiddenByRoute =
    pathname === '/maintenance' ||
    pathname === '/app/messages' ||
    pathname.startsWith('/app/messages/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/onboarding/');
  const isVisible = Boolean(user) && !isHiddenByRoute;

  // Register both launchers with the FloatingDock orchestrator (TCK-275).
  // Tailwind hides one of them visually (`hidden md:block` vs `md:hidden`) —
  // we mirror that gate here so the *invisible* launcher never claims a slot
  // in the dock. Otherwise its declared height would push every higher-priority
  // slot (e.g. the comparator pill) up by ~48 px of phantom space, and the
  // 3 mm gap the user sees would no longer be 3 mm.
  const isMobile = useMatchesMaxWidth(MD_BREAKPOINT_PX - 1);
  const desktopSlot = useFloatingDockSlot({
    id: 'chat-widget-desktop',
    corner: 'bottom-right',
    priority: 0,
    height: CHAT_LAUNCHER_DESKTOP_HEIGHT_PX,
    enabled: isVisible && !isMobile,
  });
  const mobileSlot = useFloatingDockSlot({
    id: 'chat-widget-mobile-fab',
    corner: 'bottom-right',
    priority: 0,
    height: CHAT_FAB_MOBILE_HEIGHT_PX,
    enabled: isVisible && isMobile,
  });

  // Bail out late — after every hook has run.
  if (!isVisible) return null;

  const badgeLabel = unread > 9 ? '9+' : String(unread);
  const launcherAria =
    unread > 0 ? t('launcherAriaWithUnread', { count: unread }) : t('launcherAria');

  return (
    <>
      {/* Desktop launcher + panel */}
      <div
        style={{ bottom: desktopSlot.bottom }}
        className={cn(
          'pointer-events-none fixed right-4 hidden md:block',
          // While the panel is open we lift the whole container above other
          // floating UI (compare pill at z-40, Leaflet's internal panes that
          // reach z-700 on the publish location picker). When closed we stay
          // at z-40 so real Radix modals (z-50) can still cover the launcher.
          panelOpen ? 'z-[1000]' : 'z-40',
        )}
      >
        {panelOpen && (
          <div
            role="dialog"
            aria-label={t('panelAriaLabel')}
            className="pointer-events-auto mb-3 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-black/5"
            data-testid="chat-widget-panel"
          >
            <header className="flex items-center justify-between border-b border-border/60 bg-background px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {t('panelTitle')}
                </h2>
                {unread > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('unreadInline', { count: unread })}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={fermerPanneau}
                aria-label={t('closePanel')}
                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                data-testid="chat-widget-close"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            {brouillon ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <PropertyDraftChatView
                  property={brouillon.property}
                  recipientName={brouillon.recipient?.name ?? null}
                  recipientAvatarUrl={brouillon.recipient?.avatar_url ?? null}
                  onBack={retourALaListe}
                  onCreated={(id) => {
                    // Le fil vient de naître : on quitte le brouillon pour la vraie
                    // conversation, sans rechargement ni navigation (AC4).
                    setSelectedId(id);
                    setOpen(true);
                    consommerCible?.();
                  }}
                />
              </div>
            ) : conversationAffichee ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <ChatView
                  conversationId={conversationAffichee}
                  variant="widget"
                  onBack={retourALaListe}
                />
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto">
                  <ConversationList
                    selectedId={conversationAffichee}
                    onSelect={(id) => setSelectedId(id)}
                  />
                </div>
                <footer className="border-t border-border/60 bg-background px-4 py-2 text-center">
                  <Link
                    href="/app/messages"
                    onClick={fermerPanneau}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t('viewAll')}
                  </Link>
                </footer>
              </>
            )}
          </div>
        )}

        <button
          ref={launcherRef}
          type="button"
          onClick={() => {
            // ⚠ `panelOpen`, pas `open` : le panneau peut être ouvert par une fiche de bien
            // sans que `open` l'ait jamais été. Le lire ici ferait « ouvrir » un panneau déjà
            // visible, et il faudrait deux clics pour le fermer.
            if (panelOpen) {
              // Un brouillon non envoyé est PERDU à la fermeture, délibérément (TCK-500,
              // « Hors périmètre »). Le rouvrir depuis la fiche le reconstruit à l'identique.
              fermerPanneau();
            } else {
              setOpen(true);
            }
          }}
          aria-expanded={panelOpen}
          aria-label={launcherAria}
          data-testid="chat-widget-launcher"
          className={cn(
            'pointer-events-auto relative inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:hover:scale-100',
            open && 'scale-95',
          )}
        >
          <MessageSquare className="size-5" aria-hidden />
          {unread > 0 && (
            <span
              data-testid="chat-widget-badge"
              aria-live="polite"
              className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-white ring-2 ring-background"
            >
              <span aria-hidden>{badgeLabel}</span>
              <span className="sr-only">
                {t('unreadInline', { count: unread })}
              </span>
            </span>
          )}
        </button>
      </div>

      {/* Mobile FAB — redirects to the full inbox page (no popup on phones). */}
      <Link
        href="/app/messages"
        aria-label={launcherAria}
        data-testid="chat-widget-mobile-fab"
        style={{ bottom: mobileSlot.bottom }}
        className="fixed right-4 z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <MessageSquare className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            data-testid="chat-widget-mobile-badge"
            aria-live="polite"
            className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-white ring-2 ring-background"
          >
            <span aria-hidden>{badgeLabel}</span>
            <span className="sr-only">
              {t('unreadInline', { count: unread })}
            </span>
          </span>
        )}
      </Link>
    </>
  );
}
