'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Copy, FileText, Info, MessageCircleQuestion, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { LONGUEUR_MAX_DE_LA_QUESTION, useDeciderLaSuggestion, useEtatDuCopilote, usePoserUneQuestion } from '@/lib/queries/copilote';
import { AvisSurLaProposition, CadreDeLAssistant, MarqueDeLAssistant, PourVousSeulement } from './GrammaireDeLAssistant';
import { EtatDeLAssistant, raisonDuSilence } from './EtatDeLAssistant';

interface DemanderAuFilProps {
  readonly conversationId: number;
  readonly ouvert: boolean;
  readonly onOuvertChange: (ouvert: boolean) => void;
  /** « Mettre dans le composeur » : remplit le composeur, SANS envoyer. */
  readonly onVersLeComposeur: (texte: string) => void;
  readonly heureDe: (messageId: number) => string | null;
  readonly onAllerAuMessage: (messageId: number) => void;
}

/**
 * TCK-2977 (ADR-0131 § 3, maquette `fil-copilote` A, écran `demander`) — « Demander au fil », ouvert par ✦ de
 * l'en-tête : une feuille au téléphone (88 % de la hauteur), le panneau droit au bureau. La question posée, la
 * réponse dans la grammaire de l'assistant, ses sources (un message mène au message), « Mettre dans le
 * composeur », et ce que l'assistant lit. Rien ne s'envoie d'ici.
 */
export function DemanderAuFil({ conversationId, ouvert, onOuvertChange, onVersLeComposeur, heureDe, onAllerAuMessage }: DemanderAuFilProps) {
  const t = useTranslations('messaging.copilote');
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { etat } = useEtatDuCopilote(conversationId, userId, ouvert);
  const poser = usePoserUneQuestion(conversationId, userId);
  const decider = useDeciderLaSuggestion(conversationId, userId);
  const [question, setQuestion] = useState('');
  const [avisDonnePour, setAvisDonnePour] = useState<number | null>(null);
  // P228.06 (ADR-0019) — un avis refusé se dit, et se redonne.
  const messageErreur = useMessageErreurApi();

  const sorte = etat?.question ?? null;
  const reponse = sorte?.etat === 'prete' ? sorte.proposition : null;
  // ✦ se grise sur l'une ou l'autre sorte : la feuille dit pourquoi dans les deux cas.
  const silence = raisonDuSilence(sorte) ?? raisonDuSilence(etat?.resume);
  const enCours = poser.isPending || sorte?.etat === 'en_cours';
  const echec = !silence && (sorte?.etat === 'echec' || poser.isError);

  function demander(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || enCours) return;
    poser.mutate({ question: q }, { onSuccess: () => setQuestion('') });
  }

  return (
    <FeuilleDuBas
      open={ouvert}
      onOpenChange={(o) => onOuvertChange(o)}
      titre={t('demander.titre')}
      className="max-md:h-[88dvh] max-md:max-h-[88dvh]"
      pied={
        <form onSubmit={demander} className="flex w-full items-center gap-2">
          <Input
            profil="phrase"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            enterKeyHint="send"
            maxLength={LONGUEUR_MAX_DE_LA_QUESTION}
            placeholder={reponse ? t('demander.autre') : t('demander.placeholder')}
            aria-label={t('demander.placeholder')}
            className="min-w-0 flex-1 rounded-full bg-background px-4"
          />
          <button
            type="submit"
            aria-label={t('demander.envoyer')}
            disabled={enCours || question.trim() === ''}
            className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-foreground text-background outline-none hover:bg-foreground/90 focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
          >
            <SendHorizontal className="size-5" aria-hidden="true" />
          </button>
        </form>
      }
    >
      <div className="space-y-3" data-testid="demander-au-fil">
        {silence ? <EtatDeLAssistant raison={silence} /> : null}
        {reponse ? (
          <>
            {reponse.question ? (
              <div className="rounded-xl border border-border bg-card px-3.5 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">{t('demander.votreQuestion')}</p>
                <p className="mt-0.5 text-corps text-pretty break-words">{reponse.question}</p>
              </div>
            ) : null}
            <CadreDeLAssistant
              data-testid="reponse-de-l-assistant"
              pied={
                <>
                  <Button size="sm" variant="outline" onClick={() => onVersLeComposeur(reponse.reponse)}>
                    <Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    {t('demander.versLeComposeur')}
                  </Button>
                  {sorte?.suggestionId != null ? (
                    <AvisSurLaProposition
                      donne={avisDonnePour === sorte.suggestionId}
                      enCours={decider.isPending}
                      onAvis={(decision) => {
                        setAvisDonnePour(sorte.suggestionId);
                        decider.mutate({ suggestionId: sorte.suggestionId!, decision }, { onError: () => setAvisDonnePour(null) });
                      }}
                    />
                  ) : null}
                  {decider.isError ? (
                    <p role="alert" className="w-full text-xs text-destructive">
                      {messageErreur(decider.error)}
                    </p>
                  ) : null}
                </>
              }
            >
              <MarqueDeLAssistant texte={t('demander.reponse')} />
              <p className="mt-1.5 text-corps leading-snug whitespace-pre-line text-pretty break-words">{reponse.reponse}</p>
              {reponse.sources.length > 0 ? (
                <>
                  <p className="mt-3 text-xs font-medium text-muted-foreground">{t('demander.sources')}</p>
                  <ul className="mt-1 space-y-1.5">
                    {reponse.sources.map((s) => {
                      const heure = s.type === 'message' ? heureDe(s.id) : null;
                      const libelle = s.type === 'message' ? t('demander.sourceMessage', { heure: heure ?? '—' }) : t('demander.sourceObjet');
                      const Icone = s.type === 'message' ? MessageCircleQuestion : FileText;
                      return (
                        <li key={`${s.type}-${s.objet_type ?? ''}-${s.id}`}>
                          {s.type === 'message' && heure ? (
                            <button
                              type="button"
                              onClick={() => {
                                onOuvertChange(false);
                                onAllerAuMessage(s.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-md text-left text-ui font-medium text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                            >
                              <Icone className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate">{libelle}</span>
                              <ArrowUpRight className="size-3.5 flex-none" aria-hidden="true" />
                            </button>
                          ) : (
                            <span className="flex items-center gap-2 text-ui font-medium text-foreground">
                              <Icone className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate">{libelle}</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
              <div className="mt-2.5">
                <PourVousSeulement />
              </div>
            </CadreDeLAssistant>
          </>
        ) : null}
        {enCours ? (
          <p aria-live="polite" className="text-xs text-muted-foreground">
            <MarqueDeLAssistant texte={t('demander.enCours')} className="font-medium text-muted-foreground" />
          </p>
        ) : echec ? (
          <p role="status" className="text-ui text-muted-foreground">
            {t('demander.echec')}
          </p>
        ) : null}
        <p className="flex gap-2 text-ui leading-snug text-muted-foreground">
          <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('demander.perimetre')}
        </p>
      </div>
    </FeuilleDuBas>
  );
}
