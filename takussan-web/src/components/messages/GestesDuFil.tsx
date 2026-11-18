'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import {
  MOTIFS_DE_SIGNALEMENT,
  useElargirLeFilDirect,
  useReportConversation,
  type MessagingContact,
  type MotifDeSignalement,
} from '@/lib/queries/conversations';
import { AlerteErreurs, phrasesDeValidation } from './erreursDeValidation';
import { ParticipantPicker } from './ParticipantPicker';

/**
 * TCK-2860 — les deux gestes du « ⋯ » d'un fil qui ouvrent un dialogue : « Signaler la conversation »
 * et « Ajouter un participant » (maquette `app-messagerie` a/2, menu du bureau et feuille du
 * téléphone). Montés par la SEULE page de la messagerie : le widget flottant importe `EnTeteDuFil`,
 * qui ne reçoit que les rappels (`GestesDuFil`) — ni ces dialogues ni leurs dictionnaires n'entrent
 * dans la coque.
 */
export type GestesDuFil = {
  /**
   * « Marquer comme non lue » (`PUT …/unread`) : la page tient la mutation, l'appelant dit l'échec
   * (et ferme sa feuille au succès).
   */
  readonly onMarquerNonLue: (rappels: { readonly onSuccess?: () => void; readonly onError: (erreur: unknown) => void }) => void;
  /** Fil direct seulement : élargir le fil ouvre un NOUVEAU groupe (ADR-0114). */
  readonly onAjouterUnParticipant?: () => void;
  readonly onSignaler: () => void;
  /**
   * TCK-2968 (ADR-0128 § 7) — « Confier à un collègue » : une salle ou un groupe, par le personnel, hors
   * impersonation. La page le décide ; absent, le menu ne l'offre pas.
   */
  readonly onConfier?: () => void;
};

/** Le plafond d'un groupe (`AddParticipantsRequest`, 20 membres) moins les deux membres de la directe. */
const MAX_AJOUTS = 18;

function codeDe(erreur: unknown): string | null {
  if (!(erreur instanceof ApiError)) return null;
  const data = erreur.data as { code?: unknown } | null;
  return data && typeof data.code === 'string' ? data.code : null;
}

/**
 * « Signaler la conversation » (`POST …/reports`, TCK-2859) : un motif codé, un commentaire
 * facultatif (≤ 500), puis la confirmation « Conversation signalée » DANS le dialogue — ni toast (le
 * dialogue vit aussi hors des coques qui en montent un) ni phrase perdue à la fermeture. Un second
 * signalement (409 `conversation.already_reported`) le dit tel quel.
 */
export function DialogueSignaler({
  conversationId,
  open,
  onOpenChange,
}: {
  readonly conversationId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('messaging.signaler');
  const tActions = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const signaler = useReportConversation(conversationId);
  const [motif, setMotif] = useState<MotifDeSignalement | ''>('');
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [etat, setEtat] = useState<'saisie' | 'fait' | 'deja'>('saisie');
  const idCommentaire = useId();
  const idMotif = useId();

  function changerOuverture(ouvert: boolean) {
    if (!ouvert) {
      setMotif('');
      setCommentaire('');
      setErreur(null);
      setEtat('saisie');
    }
    onOpenChange(ouvert);
  }

  function envoyer() {
    if (motif === '') {
      setErreur(t('choisirUnMotif'));
      return;
    }
    setErreur(null);
    const texte = commentaire.trim();
    signaler.mutate(
      { reason: motif, ...(texte ? { comment: texte } : {}) },
      {
        onSuccess: () => setEtat('fait'),
        onError: (e) => {
          if (codeDe(e) === 'conversation.already_reported') setEtat('deja');
          else setErreur(messageErreur(e, t('echec')));
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={changerOuverture}>
      <DialogContent data-testid="dialogue-signaler">
        {etat === 'saisie' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('titre')}</DialogTitle>
              <DialogDescription>{t('description')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <p id={idMotif} className="text-ui font-medium text-muted-foreground">
                {t('motif')}
              </p>
              <RadioGroup
                value={motif}
                onValueChange={(v) => setMotif(v as MotifDeSignalement)}
                aria-labelledby={idMotif}
                className="gap-2"
              >
                {MOTIFS_DE_SIGNALEMENT.map((m) => (
                  <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm md:min-h-0">
                    <Radio value={m} />
                    {t(`motifs.${m}`)}
                  </label>
                ))}
              </RadioGroup>
              <div>
                <label htmlFor={idCommentaire} className="mb-1 block text-ui font-medium text-muted-foreground">
                  {t('commentaire')}
                </label>
                <Textarea
                  id={idCommentaire}
                  value={commentaire}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </div>
              {erreur ? <AlerteErreurs erreurs={[erreur]} /> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => changerOuverture(false)}>
                {tActions('cancel')}
              </Button>
              <Button type="button" variant="destructive" onClick={envoyer} disabled={signaler.isPending}>
                {t('envoyer')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CircleCheck className="size-5 text-accent" aria-hidden="true" />
                {etat === 'fait' ? t('fait') : t('titre')}
              </DialogTitle>
              <DialogDescription role="status">{etat === 'fait' ? t('faitDetail') : t('deja')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => changerOuverture(false)}>
                {tActions('close')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * « Ajouter un participant » sur un fil DIRECT (ADR-0114, TCK-2859) : le dialogue dit d'abord qu'un
 * NOUVEAU groupe est créé, sans l'historique ; la liste vient de `GET …/contacts` de la directe (la
 * règle de l'ajout). `POST …/participants` rend 201 avec ce groupe, que `onCree` ouvre. Le bouton est
 * désactivé pendant l'envoi : un double envoi créerait deux groupes (ADR-0114 § Conséquences).
 */
export function DialogueElargirLeFil({
  conversationId,
  nomDeLAutre,
  exclus,
  open,
  onOpenChange,
  onCree,
}: {
  readonly conversationId: number;
  readonly nomDeLAutre: string;
  /** L'autre partie et soi-même : jamais « de neuf » (422 sinon). */
  readonly exclus: readonly number[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCree: (groupeId: number) => void;
}) {
  const t = useTranslations('messaging.elargir');
  const tActions = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const elargir = useElargirLeFilDirect(conversationId);
  const [personnes, setPersonnes] = useState<MessagingContact[]>([]);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const idChamp = useId();
  const idAide = useId();

  function changerOuverture(ouvert: boolean) {
    if (!ouvert) {
      setPersonnes([]);
      setErreurs([]);
    }
    onOpenChange(ouvert);
  }

  function creer() {
    if (personnes.length === 0) {
      setErreurs([t('choisirUnePersonne')]);
      return;
    }
    setErreurs([]);
    elargir.mutate(
      { user_ids: personnes.map((p) => p.id) },
      {
        onSuccess: (reponse) => {
          changerOuverture(false);
          onCree(reponse.data.id);
        },
        onError: (e) => setErreurs(phrasesDeValidation(e) ?? [messageErreur(e, t('echec'))]),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={changerOuverture}>
      <DialogContent data-testid="dialogue-elargir">
        <DialogHeader>
          <DialogTitle>{t('titre')}</DialogTitle>
          <DialogDescription id={idAide}>{t('explication', { nom: nomDeLAutre })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={idChamp} className="block text-ui font-medium text-muted-foreground">
            {t('personnes')}
          </label>
          <ParticipantPicker
            inputId={idChamp}
            describedBy={idAide}
            value={personnes}
            onChange={setPersonnes}
            max={MAX_AJOUTS}
            conversationId={conversationId}
            excludeIds={exclus}
          />
          <AlerteErreurs erreurs={erreurs} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => changerOuverture(false)}>
            {tActions('cancel')}
          </Button>
          <Button type="button" onClick={creer} disabled={elargir.isPending} aria-busy={elargir.isPending || undefined}>
            {t('creer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
