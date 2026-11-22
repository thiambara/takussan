'use client';

import Link from 'next/link';
import { useRef, useState, type HTMLAttributes, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { useMyProfiles } from '@/hooks/useProfiles';
import type { AppNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

import { FAMILLES, familleDe } from './familles';
import { LienDansLAgence } from './LienDansLAgence';
import { useTexteNotification } from './texteNotification';
import { useQuand } from './useQuand';

type NotificationRowProps = {
  readonly notification: AppNotification;
  /** Appelé au clic sur une ligne qui mène quelque part (la ligne ou son verbe) : elle est marquée lue. */
  readonly onOpen: (notification: AppNotification) => void;
  readonly onToggleRead: (notification: AppNotification) => void;
  readonly pending?: boolean;
  /** `bell` : titre sur deux lignes au plus ; `page` : sur une ligne dès `md` (l'historique du bureau). */
  readonly variant?: 'bell' | 'page';
  /** Le verbe de cette ligne est l'action principale de la liste (bouton plein ; les autres sont en contour). */
  readonly verbePrincipal?: boolean;
  /** L'instant de référence des dates relatives (relu chaque minute par la liste). */
  readonly maintenant?: Date;
};

/** La largeur du geste « Marquer lu » révélé par le balayage (`w-24`). */
const LARGEUR_DU_GESTE = 96;

/**
 * TCK-2634 — le balayage d'une ligne au doigt : vers la gauche, il découvre « Marquer lu » ; au-delà de
 * la moitié du geste, la ligne reste ouverte. Le pointeur de la souris et le stylet ne balaient pas
 * (`pointerType === 'touch'`). Un balayage n'ouvre pas la ligne : le clic qui le suit est avalé.
 */
export function useBalayage() {
  const [decalage, setDecalage] = useState(0);
  const depart = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const aBalaye = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'touch') return;
    depart.current = { x: e.clientX, y: e.clientY, base: decalage, horizontal: null };
    aBalaye.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = depart.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.horizontal === null && Math.hypot(dx, dy) > 8) d.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!d.horizontal) return;
    aBalaye.current = true;
    setDecalage(Math.max(-LARGEUR_DU_GESTE, Math.min(0, d.base + dx)));
  };
  const finir = () => {
    if (!depart.current) return;
    depart.current = null;
    setDecalage((x) => (x < -LARGEUR_DU_GESTE / 2 ? -LARGEUR_DU_GESTE : 0));
  };

  return {
    decalage,
    fermer: () => setDecalage(0),
    ouvrir: () => setDecalage(-LARGEUR_DU_GESTE),
    /** À poser sur la ligne qui glisse. */
    poignees: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finir,
      onPointerCancel: finir,
      onClickCapture: (e: MouseEvent) => {
        if (!aBalaye.current) return;
        aBalaye.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    },
  };
}

/** L'icône de la famille dans un disque à son ton ; la pastille « non lue », ou le compte d'un repli. */
export function IconeDeFamille({
  notification,
  compte,
}: {
  readonly notification: AppNotification;
  readonly compte?: number;
}) {
  const t = useTranslations('nav.notifications');
  const famille = familleDe(notification);
  const { icone: Icone, ton } = FAMILLES[famille];
  const nonLue = !notification.read_at;
  return (
    <span
      data-slot="icone-de-famille"
      data-famille={famille}
      className={cn('relative inline-flex size-9 flex-none items-center justify-center self-start rounded-full', ton)}
    >
      <Icone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
      {compte ? (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -bottom-1 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-foreground px-1 text-pastille font-semibold tabular-nums text-background ring-2 ring-card"
        >
          {compte}
        </span>
      ) : nonLue ? (
        <span role="img" aria-label={t('nonLue')} className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card" />
      ) : null}
    </span>
  );
}

/**
 * Le geste secondaire d'une ligne : au bureau (`md` et plus), un bouton-icône toujours visible (✓ pour
 * « marquer comme lue », ○ pour « non lue ») ; au téléphone, le panneau que découvre le balayage.
 * Les deux sont dans le document ; un seul est affiché à une largeur donnée (`hidden`, donc hors de
 * l'arbre d'accessibilité). Le panneau du téléphone reste atteignable au clavier : focalisé, il ouvre
 * la ligne.
 */
export function useGestesSecondaires({
  nonLue,
  pending,
  onBasculer,
  libelleBureau,
  ouvrirLeBalayage,
}: {
  readonly nonLue: boolean;
  readonly pending: boolean;
  readonly onBasculer: () => void;
  /** Le nom du bouton du bureau, par défaut « Marquer comme lue / non lue ». */
  readonly libelleBureau?: string;
  readonly ouvrirLeBalayage: () => void;
}) {
  const t = useTranslations('nav.notifications');
  return {
    panneau: (
      <button
        type="button"
        data-slot="geste-balaye"
        disabled={pending}
        onClick={onBasculer}
        onFocus={ouvrirLeBalayage}
        className="absolute inset-y-0 right-0 flex w-24 flex-col items-center justify-center gap-1 bg-foreground text-xs font-semibold text-background outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 md:hidden"
      >
        <Check className="size-5" aria-hidden="true" />
        {nonLue ? t('markRead') : t('markUnread')}
      </button>
    ),
    bouton: (
      <button
        type="button"
        data-slot="geste-du-bureau"
        disabled={pending}
        onClick={onBasculer}
        aria-label={libelleBureau ?? (nonLue ? t('marquerLue') : t('marquerNonLue'))}
        className="hidden size-8 flex-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50 md:inline-flex"
      >
        {nonLue ? <Check className="size-4" aria-hidden="true" /> : <Circle className="size-3.5" aria-hidden="true" />}
      </button>
    ),
  };
}

/** La rangée, posée sur la carte (une non-lue est teintée du primaire à 5 %, comme la maquette). */
export function FondDeRangee({
  nonLue,
  decalage,
  poignees,
  children,
}: {
  readonly nonLue: boolean;
  readonly decalage: number;
  readonly poignees: HTMLAttributes<HTMLDivElement>;
  readonly children: ReactNode;
}) {
  return (
    <div
      {...poignees}
      data-slot="rangee"
      style={decalage ? { transform: `translateX(${decalage}px)` } : undefined}
      className={cn(
        'relative flex touch-pan-y items-center gap-3 px-4 py-3 transition-transform duration-200 motion-reduce:transition-none',
        // Le ton de la maquette : 5 % de `primary` mêlé à la carte, opaque (la rangée glisse sur le geste).
        nonLue ? 'bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))]' : 'bg-card',
      )}
    >
      {children}
    </div>
  );
}

/**
 * L'espace d'une autre agence, nommé par le profil qu'on y a (« Thiès Properties », la pastille
 * « Dans Thiès Properties » de la maquette) ; rien quand l'avis est de l'espace actif. Monté pour les
 * seuls avis d'agence (`target.agency_id`), comme `LienDansLAgence`, qui lit les mêmes profils.
 */
function EspaceDeLAvis({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('nav.notifications');
  const profils = useMyProfiles().data;
  if (!profils) return null;
  const actif = profils.data.find((p) => p.id === profils.meta.active_profile_id);
  if (actif?.agency_id === agencyId) return null;
  const nom = profils.data.find((p) => p.agency_id === agencyId)?.agency?.name;
  if (!nom) return null;
  return <span className="inline-flex h-5 items-center rounded bg-muted px-1.5 font-medium text-encre-douce">{t('dansLEspace', { espace: nom })}</span>;
}

/**
 * TCK-588 — une ligne de notification, partagée par la cloche et l'historique. TCK-2634 — la ligne de
 * la maquette retenue (`app-notifications`, `Rangee`) : l'icône de la famille dans un disque à son
 * ton, le titre (deux lignes au plus), le détail, la date relative ; en bout, le VERBE d'une ligne à
 * traiter (« Confirmer »), sinon le chevron. « Marquer lu » quitte la ligne visible : balayage au
 * téléphone, bouton-icône au bureau.
 *
 * La ligne (icône, textes, chevron) est le lien vers `target.path`. Le verbe est un lien FRÈRE vers le
 * même objet, par le même chemin (`LienDansLAgence` compris : un avis d'une autre agence bascule
 * d'abord d'espace, d'où qu'on l'ouvre). Jamais deux éléments interactifs imbriqués. Sans cible, ni
 * lien ni verbe : une notification qui ne mène nulle part ne se fait pas passer pour un lien.
 *
 * Le verbe est un libellé du FRONT par code (`notifications.verbes.<code>`, principe 5), posé sur les
 * seules lignes que l'API dit « à traiter » ; une ligne sans code n'en a jamais.
 */
export function NotificationRow({
  notification,
  onOpen,
  onToggleRead,
  pending = false,
  variant = 'bell',
  verbePrincipal = false,
  maintenant,
}: NotificationRowProps) {
  const tVerbes = useTranslations('notifications.verbes');
  const quandDe = useQuand();
  const texte = useTexteNotification()(notification);
  const balayage = useBalayage();
  const nonLue = !notification.read_at;
  const path = notification.target?.path;
  const agencyId = notification.target?.agency_id;
  const code = notification.code;
  const verbe = path && notification.a_traiter && code && tVerbes.has(code) ? tVerbes(code) : null;
  const quand = quandDe(notification.created_at, maintenant ?? new Date());

  const gestes = useGestesSecondaires({
    nonLue,
    pending,
    onBasculer: () => {
      balayage.fermer();
      onToggleRead(notification);
    },
    ouvrirLeBalayage: balayage.ouvrir,
  });

  const contenu = (
    <>
      <IconeDeFamille notification={notification} />
      <span className="min-w-0 flex-1">
        <span
          data-slot="titre-de-notification"
          className={cn(
            'block text-corps leading-snug text-foreground',
            variant === 'page' ? 'line-clamp-2 md:truncate' : 'line-clamp-2',
            nonLue ? 'font-semibold' : 'font-medium',
          )}
        >
          {texte.titre}
        </span>
        {texte.corps ? <span className="block truncate text-ui text-muted-foreground">{texte.corps}</span> : null}
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <time dateTime={notification.created_at}>{quand}</time>
          {agencyId !== undefined ? <EspaceDeLAvis agencyId={agencyId} /> : null}
        </span>
      </span>
      {path && !verbe ? <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" /> : null}
    </>
  );

  const classeLien =
    'flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring';
  const classeSansLien = 'flex min-w-0 flex-1 items-center gap-3';
  const ouvrir = () => onOpen(notification);

  const lien = (enfants: ReactNode, classe: string, classeInerte: string) =>
    path && agencyId !== undefined ? (
      <LienDansLAgence path={path} agencyId={agencyId} onOpen={ouvrir} className={classe} classeSansLien={classeInerte}>
        {enfants}
      </LienDansLAgence>
    ) : path ? (
      <Link href={path} onClick={ouvrir} className={classe}>
        {enfants}
      </Link>
    ) : (
      <span className={classeInerte}>{enfants}</span>
    );

  return (
    <li className="relative overflow-hidden" data-slot="notification" data-non-lue={nonLue || undefined}>
      {gestes.panneau}
      <FondDeRangee nonLue={nonLue} decalage={balayage.decalage} poignees={balayage.poignees}>
        {lien(contenu, classeLien, classeSansLien)}
        {verbe
          ? lien(
              verbe,
              buttonVariants({ variant: verbePrincipal ? 'default' : 'outline', size: 'sm', className: 'flex-none' }),
              'hidden',
            )
          : null}
        {gestes.bouton}
      </FondDeRangee>
    </li>
  );
}
