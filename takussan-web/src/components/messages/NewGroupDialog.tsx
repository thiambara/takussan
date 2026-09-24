'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldDensityScope } from '@/components/ui/field-density';
import {
  useCreateGroupConversation,
  type CreateGroupConversationPayload,
  type MessagingContact,
} from '@/lib/queries/conversations';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ParticipantPicker } from './ParticipantPicker';
import { GroupLeasePicker, GroupPropertyPicker, type GroupContextOption } from './GroupContextPicker';
import { AlerteErreurs, phrasesDeValidation } from './erreursDeValidation';

interface NewGroupDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated?: (conversationId: number) => void;
}

const MIN_PARTICIPANTS = 2; // creator + 2 others = 3 total
const MAX_PARTICIPANTS = 19; // creator + 19 = 20 total

/**
 * Libellés des champs de contexte : une seule classe, les deux champs sont EMPILÉS (M11).
 *
 * Ils vivaient côte à côte dans `grid-cols-2`. À 360 px, « Property (optional) » passait sur deux
 * lignes et poussait son champ 40 px sous celui de « Lease (optional) » (capture du testeur,
 * 2026-09-23). Le décalage dépendait de la longueur de la TRADUCTION : aucune largeur de colonne
 * ne le corrige pour les trois langues à la fois. Empilés, les deux champs sont pleine largeur.
 */
const LIBELLE = 'mb-1.5 block text-sm font-medium text-muted-foreground';

/**
 * TCK-085 — Create a group conversation. 2-step wizard:
 *   1. choose the participants (TCK-565 : BY NAME, among the people the server accepts);
 *   2. enter subject + optional context (property/lease), each chosen from a list.
 *
 * TCK-565 — retour testeur du 2026-09-23 :
 *   - M12 : l'étape 1 demandait des « ID utilisateur » numériques → `ParticipantPicker` ;
 *   - M11 : l'étape 2 demandait l'identifiant du bien et du bail, côte à côte et décalés → deux
 *     champs empilés (le serveur refuse désormais un bien ou un bail qu'il ne voit pas) ;
 *   - M13 : le message brut « The selected participants.0 is invalid. (and 1 more error) » était
 *     rendu tel quel. L'API rend désormais une phrase localisée par problème
 *     (`messaging.errors.*`), l'écran affiche CES phrases et non le résumé de la 422
 *     (`AlerteErreurs`), et le sélecteur empêche de produire le cas nominal qui la déclenchait.
 *
 * TCK-576 — les deux champs de contexte sont des RECHERCHES serveur (`GroupContextPicker`) : les
 * listes de TCK-565 s'arrêtaient aux 100 premiers biens et baux, et 106 des 206 biens d'un agent
 * de démo ne pouvaient pas être choisis. Les props `defaultPropertyId` et `defaultLeaseId` sont
 * retirées : aucun appelant ne les passait, et un identifiant seul ne donne pas le libellé que le
 * champ affiche.
 */
export function NewGroupDialog({
  open,
  onClose,
  onCreated,
}: NewGroupDialogProps) {
  const t = useTranslations('messaging.group.create');
  const messageErreur = useMessageErreurApi();
  const create = useCreateGroupConversation();
  const [step, setStep] = useState<1 | 2>(1);
  const [participants, setParticipants] = useState<MessagingContact[]>([]);
  const [subject, setSubject] = useState('');
  const [bien, setBien] = useState<GroupContextOption | null>(null);
  const [bail, setBail] = useState<GroupContextOption | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const setError = (phrase: string | null) => setErreurs(phrase ? [phrase] : []);

  function reset() {
    setStep(1);
    setParticipants([]);
    setSubject('');
    setBien(null);
    setBail(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function nextStep() {
    setError(null);
    if (participants.length < MIN_PARTICIPANTS) {
      setError(t('minParticipants', { min: MIN_PARTICIPANTS + 1 }));
      return;
    }
    setStep(2);
  }

  function choisirBien(suivant: GroupContextOption | null) {
    setBien(suivant);
    // Un bail d'un AUTRE bien ne peut pas rester choisi : la liste des baux se restreint au bien,
    // et l'API refuse la paire (`CreateGroupConversationRequest`, 422 sur `lease_id`).
    // ⚠ On compare au bien DU BAIL, pas au bien précédent (réparation 1, 2026-09-24) : choisir le
    // bail, puis son propre bien, effaçait le bail parce que le bien passait de « aucun » à « un ».
    // Retirer le bien garde le bail : un bail seul est un rattachement valide.
    if (suivant !== null && bail !== null && bail.propertyId !== suivant.id) setBail(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (subject.trim().length === 0) {
      setError(t('subjectRequired'));
      return;
    }
    const payload: CreateGroupConversationPayload = {
      type: 'group',
      subject: subject.trim(),
      participants: participants.map((p) => p.id),
    };
    if (bien) payload.property_id = bien.id;
    if (bail) payload.lease_id = bail.id;
    try {
      const res = await create.mutateAsync(payload);
      onCreated?.(res.data.id);
      handleClose();
    } catch (err) {
      // Les phrases de l'API, une par problème — jamais le résumé `message` d'une 422, qui n'en
      // montre qu'une et accole « (and N more error) » (M13, cf. `phrasesDeValidation`).
      setErreurs(phrasesDeValidation(err) ?? [messageErreur(err, t('createFailed'))]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {step === 1 ? t('step1Description') : t('step2Description')}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <div>
              <label className={LIBELLE} htmlFor="participant-input">
                {t('participantsLabel')}
              </label>
              <ParticipantPicker
                inputId="participant-input"
                describedBy="participant-hint"
                value={participants}
                onChange={(next) => {
                  setError(null);
                  setParticipants(next);
                }}
                max={MAX_PARTICIPANTS}
                onMaxReached={() => setError(t('maxParticipants', { max: MAX_PARTICIPANTS + 1 }))}
              />
              <p id="participant-hint" className="mt-1.5 text-xs text-muted-foreground">
                {t('participantsHint')}
              </p>
            </div>

            <AlerteErreurs erreurs={erreurs} />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>
                {t('cancel')}
              </Button>
              <Button type="button" onClick={nextStep}>
                {t('next')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // TCK-468 — la portée « confortable » met le Sujet à 44 px, comme les deux sélecteurs de
          // contexte : il faisait 40 px au mobile et 32 au bureau à côté d'eux (réparation 1).
          <form onSubmit={handleSubmit} className="space-y-3" {...fieldDensityScope()}>
            <div>
              <label className={LIBELLE} htmlFor="group-subject">
                {t('subjectLabel')}
              </label>
              <Input
                id="group-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                required
              />
            </div>

            <div data-testid="group-context-fields" className="space-y-3">
              <div>
                <label className={LIBELLE} htmlFor="group-property">
                  {t('propertyLabel')}
                </label>
                <GroupPropertyPicker inputId="group-property" value={bien} onChange={choisirBien} />
              </div>

              <div>
                <label className={LIBELLE} htmlFor="group-lease">
                  {t('leaseLabel')}
                </label>
                <GroupLeasePicker
                  inputId="group-lease"
                  value={bail}
                  onChange={setBail}
                  propertyId={bien?.id ?? null}
                />
              </div>
            </div>

            <AlerteErreurs erreurs={erreurs} />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
