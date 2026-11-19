'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Handshake, MessageSquare, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useEtatDuCopilote, type AppuiDuBrouillon, type PropositionDeBrouillon } from '@/lib/queries/copilote';
import { CadreDeLAssistant, MarqueDeLAssistant } from './GrammaireDeLAssistant';

/** TCK-2978 — un brouillon reçu, tel que le composeur le tient jusqu'à l'envoi ou au jet. */
export type BrouillonRecu = PropositionDeBrouillon & { readonly suggestionId: number };

/** La demande en cours : `avant` est la dernière suggestion connue au moment du geste (une plus ancienne ne compte pas). */
export type AttenteDuBrouillon = { readonly n: number; readonly avant: number | null };

interface BrouillonDuComposeurProps {
  readonly conversationId: number;
  readonly attente: AttenteDuBrouillon | null;
  /** Le brouillon dans le composeur, s'il y en a un. */
  readonly brouillon: BrouillonRecu | null;
  /** Le texte du composeur est-il encore celui du brouillon ? Dès la première frappe, le cadre disparaît. */
  readonly intact: boolean;
  readonly onArrive: (b: BrouillonRecu) => void;
  readonly onJeter: () => void;
  readonly onRedemander: (ton: 'court' | 'normal') => void;
}

const ICONE_DE_L_APPUI: Readonly<Record<string, typeof FileText>> = {
  lease: FileText,
  lease_payment: Wallet,
  commitment: Handshake,
  message: MessageSquare,
};

/**
 * TCK-2978 (ADR-0131 § 5, maquette `fil-copilote` A, écran `brouillon`) — au-dessus du champ, le brouillon dans
 * la grammaire de l'assistant : « Brouillon de l'assistant · relisez avant d'envoyer », « Appuyé sur : » et ses
 * puces, puis « Jeter le brouillon », « Proposer un autre brouillon », « Plus court ». Le texte est DANS le champ ;
 * seul « Envoyer » du composeur le publie. Retouché, il devient un texte ordinaire : le cadre disparaît.
 */
export function BrouillonDuComposeur({ conversationId, attente, brouillon, intact, onArrive, onJeter, onRedemander }: BrouillonDuComposeurProps) {
  const t = useTranslations('messaging.copilote');
  const { user } = useAuth();
  const { etat } = useEtatDuCopilote(conversationId, user?.id ?? null, attente !== null);
  const sorte = etat?.brouillon ?? null;
  const arrive =
    attente !== null && sorte?.etat === 'prete' && sorte.proposition !== null && sorte.suggestionId !== null && sorte.suggestionId !== attente.avant
      ? { ...sorte.proposition, suggestionId: sorte.suggestionId }
      : null;
  const [livre, setLivre] = useState<number | null>(null);
  if (arrive && livre !== arrive.suggestionId) setLivre(arrive.suggestionId);

  // Livré une fois par suggestion : l'effet ne suit que l'identifiant livré.
  const livrer = useEffectEvent(() => {
    if (arrive && livre === arrive.suggestionId && brouillon?.suggestionId !== arrive.suggestionId) onArrive(arrive);
  });
  useEffect(() => {
    if (livre !== null) livrer();
  }, [livre]);

  const enCours = attente !== null && !arrive && (sorte === null || sorte.etat === 'en_cours' || sorte.etat === 'aucun' || sorte.suggestionId === attente.avant);
  if (enCours && sorte?.etat !== 'refusee' && sorte?.etat !== 'echec') {
    return (
      <p aria-live="polite" className="px-1 pb-1.5 text-xs" data-testid="brouillon-en-cours">
        <MarqueDeLAssistant texte={t('brouillon.enCours')} className="font-medium text-muted-foreground" />
      </p>
    );
  }
  if (attente !== null && !brouillon && (sorte?.etat === 'refusee' || sorte?.etat === 'echec')) {
    return (
      <p role="status" className="px-1 pb-1.5 text-xs text-muted-foreground">
        {t('brouillon.echec')}
      </p>
    );
  }
  if (!brouillon || !intact) return null;

  const geste =
    'inline-flex size-11 flex-none items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';
  return (
    <div className="pb-2" data-testid="brouillon-de-l-assistant">
      <CadreDeLAssistant className="rounded-2xl">
        <MarqueDeLAssistant texte={t('brouillon.titre')} />
        {brouillon.appuis.length > 0 ? (
          <>
            <p className="mt-2 text-xs text-muted-foreground">{t('brouillon.appuyeSur')}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {brouillon.appuis.map((a) => (
                <PuceDAppui key={`${a.type}-${a.id}`} appui={a} />
              ))}
            </ul>
          </>
        ) : null}
      </CadreDeLAssistant>
      <div className="mt-1.5 flex items-center gap-1">
        <button type="button" onClick={onJeter} aria-label={t('brouillon.jeter')} className={geste}>
          <Trash2 className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onRedemander('normal')} aria-label={t('brouillon.autre')} className={geste}>
          <RotateCcw className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onRedemander('court')}
          className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('brouillon.plusCourt')}
        </button>
      </div>
    </div>
  );
}

function PuceDAppui({ appui }: { readonly appui: AppuiDuBrouillon }) {
  const t = useTranslations('messaging.copilote.appui');
  const Icone = ICONE_DE_L_APPUI[appui.type] ?? FileText;
  const cle = appui.type in ICONE_DE_L_APPUI ? appui.type : 'autre';
  return (
    <li className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-foreground">
      <Icone className="size-3.5 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="truncate">{t(cle)}</span>
    </li>
  );
}
