'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, Circle, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useMyProfiles } from '@/hooks/useProfiles';
import { etapesARendre, type ModeDemarrer } from '@/lib/navigation/demarrer';
import { useDemarrageDeLEspace } from '@/lib/queries/demarrage-espace';
import { cn } from '@/lib/utils';
import { FOCUS_RING, STYLE_TITRE } from './styles-de-la-barre';

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
 * chacune un lien vers l'écran qui la fait. Premier bloc du `<nav>` : il défile avec le menu et se lit
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
  const { activeProfileId } = useAuth();
  // Tâche 6 de TCK-2479 (mesuré au navigateur) — `activeProfileId` ne vaut que le cookie
  // `active_profile_id`, que la CONNEXION ne pose pas (seuls l'onboarding et le changement d'espace le
  // font) : un bailleur connecté normalement le voit `null`, son lien KYC perdait `?owner=`, et
  // `/onboarding/owner` le renvoyait vers `/app` — l'étape ne se faisait jamais. Le profil que l'API
  // a résolu (`meta.active_profile_id`, celui sur lequel elle a jugé les étapes) prend le relais :
  // même lecture et même cache que le sélecteur de profil de la barre, aucune requête de plus.
  const { data: profils } = useMyProfiles();
  const idProfilActif = activeProfileId ?? profils?.meta.active_profile_id ?? null;
  const [masque, setMasque] = useState(false);
  const { data, isError } = useDemarrageDeLEspace({ enabled: !masque });
  // Une réponse sans `etapes` (contrat qui dérive, relais qui rend autre chose) ne fait pas tomber la
  // barre entière : « Démarrer » accompagne, il se tait. Mesuré : sans cette garde, un `{ data: [] }`
  // levait un `TypeError` au rendu et emportait tout le menu.
  const etapes = data?.data?.etapes;
  if (masque || isError || !Array.isArray(etapes)) return null;

  const { restantes, faites, total } = etapesARendre(etapes, mode, idProfilActif, ouverte);
  if (restantes.length === 0) return null;

  return (
    <div
      role="group"
      aria-labelledby={idTitre}
      data-slot="demarrer"
      className={cn('mb-4 rounded-lg border border-border bg-muted/40 p-2', className)}
    >
      <div className="flex items-center gap-2 pl-1">
        <p id={idTitre} className={cn('min-w-0 flex-1 truncate', STYLE_TITRE)}>
          {t('titre')}
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">{t('progression', { faites, total })}</span>
        <button
          type="button"
          onClick={() => (onMasquer ? onMasquer() : setMasque(true))}
          aria-label={t('masquer')}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-md:size-9',
            FOCUS_RING,
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <ul className="mt-1 space-y-0.5">
        {restantes.map((etape) => (
          <li key={etape.code}>
            <Link
              href={etape.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-foreground transition-colors hover:bg-muted max-md:py-2',
                FOCUS_RING,
              )}
            >
              <Circle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-pretty">{t(etape.cle)}</span>
              <span className="sr-only">{t('aFaire')}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
