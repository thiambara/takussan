'use client';

import { useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ContenuDeLaCloche } from '@/components/notifications/ContenuDeLaCloche';
import { FeuilleDesNotifications } from '@/components/notifications/FeuilleDesNotifications';
import { useNotificationsDeLaCloche } from '@/components/notifications/useNotifications';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TRAIT_D_ICONE } from './styles-de-la-barre';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  /**
   * TCK-2491 — l'alignement du panneau sur la cloche : `start` dans l'en-tête de la colonne, `end` dans
   * l'en-tête mobile. TCK-2634 — le panneau du bureau s'ouvre désormais CONTRE LA COLONNE (aligné en
   * haut) ; `align` ne sert plus qu'à une cloche hors de toute colonne (repli).
   */
  readonly align?: 'start' | 'end';
  /**
   * TCK-2634 — et la surface qu'elle ouvre : `en-tete` (le téléphone) une feuille pleine hauteur,
   * `colonne` (dès `md`) un panneau de 400 px à droite de la colonne. Les deux cloches sont montées
   * ensemble (l'une est masquée par la largeur) : la prop, pas une requête média, choisit.
   *
   * TCK-2691 (ADR-0106, C5 et C9) — les cotes de l'icône selon la surface : dans la colonne, 18 px au
   * trait des lignes (1,5) en `muted-foreground` ; dans l'en-tête du téléphone, 20 px au trait 1,75 à
   * l'encre douce (TCK-2685). Un attribut `stroke-width` ne varie pas selon la largeur : d'où la prop.
   */
  readonly emplacement?: 'colonne' | 'en-tete';
}

/**
 * TCK-2691 — le bouton et l'icône de la cloche, par emplacement.
 * TCK-2712 (11a) — et la place de la pastille des non-lues, celle de la maquette sur chaque surface :
 * colonne `-right-2 -top-1.5` de l'icône de 18 px = `top-0 -right-0.5` du bouton de 28,8 px ; en-tête
 * `right-0.5 top-0.5` du bouton de 40 px.
 */
const COTES_DE_LA_CLOCHE = {
  colonne: { bouton: 'text-muted-foreground', icone: 'size-[18px]', trait: TRAIT_D_ICONE, pastille: 'top-0 -right-0.5' },
  'en-tete': { bouton: 'text-encre-douce', icone: 'size-5', trait: 1.75, pastille: 'top-0.5 right-0.5' },
} as const;

export function NotificationBell({ align = 'end', emplacement = 'colonne' }: NotificationBellProps) {
  const cotes = COTES_DE_LA_CLOCHE[emplacement];
  const t = useTranslations('nav.notifications');
  const [open, setOpen] = useState(false);
  const cloche = useRef<HTMLButtonElement>(null);
  // La pastille lit la liste « Tout » de la cloche, relue toutes les 30 s (sans sondage plus serré) :
  // `meta.unread` porte sur toutes les non-lues, filtres ignorés.
  const query = useNotificationsDeLaCloche(false);
  const unread = query.data?.meta.unread ?? 0;

  const classes = cn(
    'relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors after:absolute after:-inset-1 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:size-10',
    cotes.bouton,
  );
  const contenuDuBouton = (
    <>
      <Bell className={cotes.icone} strokeWidth={cotes.trait} aria-hidden="true" />
      {unread > 0 ? (
        // TCK-2712 (11a, ADR-0106) — la `Pastille` de la maquette : 16 px (14,4 dès lg), 10 px 600,
        // interligne 10 centré dans sa boîte, anneau `card`.
        <span
          className={cn(
            'absolute inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-pastille font-semibold leading-none tabular-nums text-primary-foreground ring-2 ring-card',
            cotes.pastille,
          )}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </>
  );

  /*
   * TCK-2634 — au téléphone, une feuille pleine hauteur (cf. `FeuilleDesNotifications`) : la cloche est
   * son déclencheur, le focus lui revient à la fermeture.
   */
  if (emplacement === 'en-tete') {
    return (
      <FeuilleDesNotifications
        open={open}
        onOpenChange={setOpen}
        declencheur={
          <button type="button" aria-label={t('label')} data-slot="cloche" className={classes}>
            {contenuDuBouton}
          </button>
        }
      />
    );
  }

  /*
   * TCK-569 (M14) — le panneau est la fenêtre de la primitive `Popover` (base-ui), du même système de
   * fermeture que le menu du compte voisin : il se referme dès que le focus le quitte, sur appui
   * extérieur et sur Échap, et rend le focus à la cloche. TCK-572 — un voile TRANSPARENT reçoit l'appui
   * « à côté » : le panneau se ferme et rien d'autre ne se passe.
   *
   * TCK-2634 — le panneau de 400 px de la maquette (`PanneauCloche`), posé CONTRE LA COLONNE (son bord
   * droit, + 8 px) et non plus sous la cloche, où il recouvrait le bloc « Aujourd'hui » de la colonne ;
   * de `md` à `lg`, contre le rail. Hors de toute colonne (tests, repli), contre la cloche.
   *
   * Pastille : `--destructive` puis (TCK-2491) le primaire, la seule couleur du menu, sous
   * `text-primary-foreground`, mesuré clair et sombre.
   */
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger ref={cloche} aria-label={t('label')} data-slot="cloche" className={classes}>
        {contenuDuBouton}
      </PopoverTrigger>

      <PopoverContent
        anchor={() => cloche.current?.closest('aside') ?? cloche.current}
        side="right"
        align="start"
        sideOffset={8}
        alignOffset={11}
        collisionPadding={8}
        voile
        aria-label={t('center')}
        data-align={align}
        className="flex max-h-[min(40rem,calc(100dvh-1.5rem))] w-[25rem] max-w-[calc(100vw-var(--spacing)*4)] flex-col overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-panneau-cloche ring-0"
      >
        <ContenuDeLaCloche surface="panneau" onFermer={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
