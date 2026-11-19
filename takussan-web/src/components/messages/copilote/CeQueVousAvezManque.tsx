'use client';

import { useContext, useEffect, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import {
  SEUIL_DU_RESUME,
  demanderLeResume,
  etatDuCopiloteQueryKey,
  useDeciderLaSuggestion,
  useEtatDuCopilote,
} from '@/lib/queries/copilote';
import { cn } from '@/lib/utils';
import { AvisSurLaProposition, CadreDeLAssistant, MarqueDeLAssistant, PourVousSeulement } from './GrammaireDeLAssistant';
import { EtatDeLAssistant, raisonDuSilence } from './EtatDeLAssistant';
import type { FenetreDesNonLus } from './fenetreDesNonLus';

interface CeQueVousAvezManqueProps {
  readonly conversationId: number;
  /** La fenêtre relevée à l'ouverture, AVANT la marque de lecture. */
  readonly fenetre: FenetreDesNonLus;
  /** L'heure affichée d'un message chargé (renvoi cliquable), ou `null` s'il n'est pas chargé. */
  readonly heureDe: (messageId: number) => string | null;
  /** Défile jusqu'au message et le surligne. */
  readonly onAllerAuMessage: (messageId: number) => void;
  /** La coupure de la fonction `resume` lue sur le fil (`copilote.fonctions`) : coupée, AUCUNE demande, l'état seul. */
  readonly coupure?: 'plateforme' | 'agence' | 'non_configuree' | null;
}

/**
 * TCK-2977 (ADR-0131 § 3, maquette `fil-copilote` A, écran `manque`) — au séparateur « N nouveaux messages »,
 * le résumé de ce que le lecteur a manqué. Il ne se demande qu'à l'ouverture d'un fil à {@link SEUIL_DU_RESUME}
 * non-lus ou plus, une fois par ouverture (`demanderLeResume`) ; en dessous, ce composant ne rend que le
 * séparateur et n'émet aucune requête.
 *
 * Un résumé prêt n'est montré que s'il résume CETTE fenêtre (`depuis_message_id` relevé à l'ouverture) : le
 * dernier résumé du lecteur peut dater d'une ouverture précédente.
 */
export function CeQueVousAvezManque({ conversationId, fenetre, heureDe, onAllerAuMessage, coupure = null }: CeQueVousAvezManqueProps) {
  const t = useTranslations('messaging.copilote');
  const { user, token } = useAuth();
  const locale = useLocale();
  const queryClient = useContext(QueryClientContext);
  const userId = user?.id ?? null;
  const fenetreChargee = fenetre.nonLus >= SEUIL_DU_RESUME && fenetre.premierNonLuId !== null;
  const charge = fenetreChargee && coupure === null;
  const { etat } = useEtatDuCopilote(conversationId, userId, charge);
  const decider = useDeciderLaSuggestion(conversationId, userId);
  const [replie, setReplie] = useState(false);
  const [avisDonne, setAvisDonne] = useState(false);

  useEffect(() => {
    if (!charge || userId === null || fenetre.premierNonLuId === null) return;
    demanderLeResume(conversationId, userId, fenetre.premierNonLuId, { token, locale }, () => {
      void queryClient?.invalidateQueries({ queryKey: etatDuCopiloteQueryKey(conversationId, userId) });
    });
  }, [charge, userId, conversationId, fenetre.premierNonLuId, token, locale, queryClient]);

  const separateur = (
    <div className="flex items-center gap-3 py-1 text-xs font-semibold text-primary-deep" data-testid="separateur-nouveaux">
      <span className="h-px flex-1 bg-primary/30" aria-hidden="true" />
      {t('nouveaux', { count: fenetre.nonLus })}
      <span className="h-px flex-1 bg-primary/30" aria-hidden="true" />
    </div>
  );

  if (fenetreChargee && (coupure === 'plateforme' || coupure === 'agence')) {
    return (
      <li className="space-y-2">
        {separateur}
        <EtatDeLAssistant raison={coupure === 'agence' ? 'coupeAgence' : 'coupePlateforme'} />
      </li>
    );
  }
  if (!charge) return <li>{separateur}</li>;

  const resume = etat?.resume;
  const proposition = resume?.etat === 'prete' && resume.proposition?.depuis_message_id === fenetre.premierNonLuId ? resume.proposition : null;
  const silence = raisonDuSilence(resume);
  const enAttente = !proposition && !silence && (resume?.etat === 'en_cours' || etat === null);

  let contenu = null;
  if (proposition && proposition.points.length > 0 && !replie) {
    const points = [...proposition.points].sort((a, b) => Number(b.attend_le_lecteur) - Number(a.attend_le_lecteur));
    const question = points.find((p) => p.attend_le_lecteur) ?? null;
    contenu = (
      <CadreDeLAssistant
        data-testid="resume-de-l-assistant"
        pied={
          <>
            {question ? (
              <Button size="sm" onClick={() => onAllerAuMessage(question.message_id)}>
                {t('resume.allerALaQuestion')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setReplie(true)}>
              {t('resume.lire', { count: fenetre.nonLus })}
            </Button>
            {resume?.suggestionId != null ? (
              <AvisSurLaProposition
                donne={avisDonne}
                enCours={decider.isPending}
                onAvis={(decision) => {
                  setAvisDonne(true);
                  decider.mutate({ suggestionId: resume.suggestionId!, decision });
                }}
              />
            ) : null}
          </>
        }
      >
        <MarqueDeLAssistant texte={t('resume.titre')} />
        <ul className="mt-2 space-y-1.5 text-corps leading-snug">
          {points.map((p) => {
            const heure = heureDe(p.message_id);
            return (
              <li key={`${p.message_id}-${p.texte}`} className="flex gap-2">
                <span className={cn('mt-[0.4375rem] size-1.5 flex-none rounded-full', p.attend_le_lecteur ? 'bg-primary' : 'bg-foreground/40')} aria-hidden="true" />
                <span className={cn(p.attend_le_lecteur && 'font-semibold')}>
                  {p.texte}
                  {heure ? (
                    <button
                      type="button"
                      onClick={() => onAllerAuMessage(p.message_id)}
                      aria-label={t('resume.renvoi', { heure })}
                      className="ml-1 inline-flex h-5 items-center gap-0.5 rounded-full border border-border bg-card px-1.5 align-middle text-xs font-medium tabular-nums text-primary-deep outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      {heure}
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2.5">
          <PourVousSeulement />
        </div>
      </CadreDeLAssistant>
    );
  } else if (silence) {
    contenu = <EtatDeLAssistant raison={silence} />;
  } else if (enAttente) {
    contenu = (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite" data-testid="resume-en-cours">
        <MarqueDeLAssistant texte={t('resume.enCours')} className="font-medium text-muted-foreground" />
      </p>
    );
  }

  return (
    <li className="space-y-2">
      {separateur}
      {contenu}
    </li>
  );
}
