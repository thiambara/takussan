'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CircleDashed, X } from 'lucide-react';
import { etapesARendre, type ModeDemarrer } from '@/lib/navigation/demarrer';
import { useDemarrageDeLEspace } from '@/lib/queries/demarrage-espace';
import { cn } from '@/lib/utils';
import {
  FOCUS_RING,
  FOCUS_RING_RENTRANT,
  ICONE_DE_LIGNE,
  STYLE_LIGNE,
  STYLE_LIGNE_REPOS,
  STYLE_TITRE,
  TRAIT_D_ICONE,
} from './styles-de-la-barre';

interface DemarrerDeLEspaceProps {
  readonly mode: ModeDemarrer;
  /** Revue de TCK-2479 (M6) — l'écran d'une étape s'ouvre-t-il au compte ? (`cheminOuvert`) */
  readonly ouverte: (href: string) => boolean;
  readonly onNavigate?: () => void;
  /**
   * TCK-2480 (A9) — la croix enregistre le masquage sur le compte, pour le persona (`demarrer_masque`) :
   * `composerMenu` rend alors `demarrer: null`, et ce composant n'est plus monté. Absent (aucun
   * fournisseur) : l'état local de TCK-2479.
   */
  readonly onMasquer?: () => void;
  /** TCK-2480 — la marge haute quand « Épinglés » le précède (A6). */
  readonly className?: string;
}

/**
 * TCK-2479 (ADR-0089 §5) — « Démarrer » : les étapes qui restent pour mettre l'espace en service,
 * chacune un lien vers l'écran qui la fait. Premier bloc du menu (`data-slot="menu"`) : il défile avec lui et se lit
 * à l'arrivée d'un espace neuf. Il ne réordonne aucune entrée du menu.
 *
 * AC5 — une étape faite SORT du groupe ; le groupe disparaît quand tout est fait. Rien pendant le
 * chargement, sur une erreur (même si le cache garde une ancienne lecture), ni pour `etapes: []` (un
 * profil sans étape) : il accompagne, il ne bloque pas — comme la carte « Mise en service » du
 * tableau de bord (TCK-589), dont il reprend trois étapes.
 *
 * TCK-2480 — avec `onMasquer` (la coque monte le fournisseur des préférences), le masquage s'enregistre
 * sur le compte, pour le persona (`demarrer_masque`) : il survit au rechargement et vaut pour les deux
 * montages de la barre. Sans lui, il vit dans un état local, qui ne survit ni au rechargement ni à
 * l'autre montage (le tiroir).
 */
export function DemarrerDeLEspace({ mode, ouverte, onNavigate, onMasquer, className }: DemarrerDeLEspaceProps) {
  const t = useTranslations('nav.sidebar.demarrer');
  const idTitre = useId();
  const [masque, setMasque] = useState(false);
  const { data, isError } = useDemarrageDeLEspace({ enabled: !masque });
  // Une réponse sans `etapes` (contrat qui dérive, relais qui rend autre chose) ne fait pas tomber la
  // barre entière : « Démarrer » accompagne, il se tait. Mesuré : sans cette garde, un `{ data: [] }`
  // levait un `TypeError` au rendu et emportait tout le menu.
  const etapes = data?.data?.etapes;
  if (masque || isError || !Array.isArray(etapes)) return null;

  const { restantes, faites, total } = etapesARendre(etapes, mode, ouverte);
  if (restantes.length === 0) return null;

  return (
    <div role="group" aria-labelledby={idTitre} data-slot="demarrer" className={cn('mb-5', className)}>
      {/* TCK-2490 (ADR-0090 §1) — dessiné comme un groupe de la colonne : un titre discret, sa
          progression, la croix ; plus d'encadré. */}
      <div className="mb-0.5 flex h-7 items-center gap-2 pl-2.5">
        <p id={idTitre} className={cn('min-w-0 flex-1 truncate', STYLE_TITRE)}>
          {t('titre')}
        </p>
        <span className="text-[0.78125rem] tabular-nums text-muted-foreground">{t('progression', { faites, total })}</span>
        <button
          type="button"
          onClick={() => (onMasquer ? onMasquer() : setMasque(true))}
          aria-label={t('masquer')}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground max-md:size-9',
            FOCUS_RING,
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <ul className="space-y-px">
        {restantes.map((etape) => (
          <li key={etape.code}>
            <Link
              href={etape.href}
              onClick={onNavigate}
              className={cn(STYLE_LIGNE, 'h-auto min-h-9 py-1.5 transition-colors max-md:h-auto max-md:min-h-11', STYLE_LIGNE_REPOS, FOCUS_RING_RENTRANT)}
            >
              <CircleDashed className={cn(ICONE_DE_LIGNE, 'text-muted-foreground')} strokeWidth={TRAIT_D_ICONE} aria-hidden />
              <span className="min-w-0 flex-1 leading-snug text-pretty">{t(etape.cle)}</span>
              <span className="sr-only">{t('aFaire')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
