'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageSquare, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatView } from '@/components/messages/ChatView';
import { cn } from '@/lib/utils';
import { useUnreadCount } from './useUnreadCount';

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

  // Restore focus to the launcher on close (a11y).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      launcherRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  // Escape closes the panel (a11y).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Visibility gates — keep them synchronous so the component returns null
  // before any expensive child renders.
  if (!user) return null;
  if (
    pathname === '/maintenance' ||
    pathname === '/app/messages' ||
    pathname.startsWith('/app/messages/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/onboarding/')
  ) {
    return null;
  }

  const badgeLabel = unread > 9 ? '9+' : String(unread);
  const launcherAria =
    unread > 0 ? t('launcherAriaWithUnread', { count: unread }) : t('launcherAria');

  return (
    <>
      {/* Desktop launcher + panel */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-40 hidden md:block">
        {open && (
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
                onClick={() => {
                  setOpen(false);
                  setSelectedId(null);
                }}
                aria-label={t('closePanel')}
                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                data-testid="chat-widget-close"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            {selectedId ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <ChatView
                  conversationId={selectedId}
                  variant="widget"
                  onBack={() => setSelectedId(null)}
                />
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto">
                  <ConversationList
                    selectedId={selectedId}
                    onSelect={(id) => setSelectedId(id)}
                  />
                </div>
                <footer className="border-t border-border/60 bg-background px-4 py-2 text-center">
                  <Link
                    href="/app/messages"
                    onClick={() => setOpen(false)}
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
            const next = !open;
            setOpen(next);
            if (!next) setSelectedId(null);
          }}
          aria-expanded={open}
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
        className="fixed bottom-4 right-4 z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
