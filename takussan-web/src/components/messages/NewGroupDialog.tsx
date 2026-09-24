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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateGroupConversation,
  useGroupLeaseOptions,
  useGroupPropertyOptions,
  type CreateGroupConversationPayload,
  type MessagingContact,
} from '@/lib/queries/conversations';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ParticipantPicker } from './ParticipantPicker';
import { AlerteErreurs, phrasesDeValidation } from './erreursDeValidation';

interface NewGroupDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated?: (conversationId: number) => void;
  readonly defaultPropertyId?: number;
  readonly defaultLeaseId?: number;
}

const MIN_PARTICIPANTS = 2; // creator + 2 others = 3 total
const MAX_PARTICIPANTS = 19; // creator + 19 = 20 total

/**
 * Valeur « aucun » des deux listes de contexte. Base UI Select ne porte pas `null` comme valeur
 * d'option, et une chaîne vide s'y confond avec « rien de sélectionné » : un jeton explicite,
 * comme `PaymentsHistoryFilters`. L'état, lui, garde `''` pour « aucun ».
 */
const AUCUN = '__aucun__';

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
 *     listes empilées, alimentées par ce que `/api/properties` et `/api/leases` montrent à
 *     l'utilisateur (le serveur refuse désormais un bien ou un bail qu'il ne voit pas) ;
 *   - M13 : le message brut « The selected participants.0 is invalid. (and 1 more error) » était
 *     rendu tel quel. L'API rend désormais une phrase localisée par problème
 *     (`messaging.errors.*`), l'écran affiche CES phrases et non le résumé de la 422
 *     (`AlerteErreurs`), et le sélecteur empêche de produire le cas nominal qui la déclenchait.
 */
export function NewGroupDialog({
  open,
  onClose,
  onCreated,
  defaultPropertyId,
  defaultLeaseId,
}: NewGroupDialogProps) {
  const t = useTranslations('messaging.group.create');
  const messageErreur = useMessageErreurApi();
  const create = useCreateGroupConversation();
  const [step, setStep] = useState<1 | 2>(1);
  const [participants, setParticipants] = useState<MessagingContact[]>([]);
  const [subject, setSubject] = useState('');
  const [propertyId, setPropertyId] = useState<string>(
    defaultPropertyId ? String(defaultPropertyId) : '',
  );
  const [leaseId, setLeaseId] = useState<string>(defaultLeaseId ? String(defaultLeaseId) : '');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const setError = (phrase: string | null) => setErreurs(phrase ? [phrase] : []);

  // Les listes de contexte ne partent qu'à l'étape 2 : l'étape 1 n'en a pas besoin.
  const surEtape2 = open && step === 2;
  const biens = useGroupPropertyOptions({ enabled: surEtape2 });
  const baux = useGroupLeaseOptions(propertyId ? Number(propertyId) : null, { enabled: surEtape2 });

  const optionsBiens = (biens.data?.data ?? []).map((p) => ({ value: String(p.id), label: p.title }));
  const optionsBaux = (baux.data?.data ?? []).map((l) => ({
    value: String(l.id),
    label: l.property?.title ? `${l.reference_number} · ${l.property.title}` : l.reference_number,
  }));

  function reset() {
    setStep(1);
    setParticipants([]);
    setSubject('');
    setPropertyId(defaultPropertyId ? String(defaultPropertyId) : '');
    setLeaseId(defaultLeaseId ? String(defaultLeaseId) : '');
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

  function choisirBien(valeur: string | null) {
    setPropertyId(!valeur || valeur === AUCUN ? '' : valeur);
    // Un bail d'un AUTRE bien ne peut pas rester choisi : la liste des baux se restreint au bien.
    setLeaseId('');
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
    if (propertyId) payload.property_id = Number(propertyId);
    if (leaseId) payload.lease_id = Number(leaseId);
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
          <form onSubmit={handleSubmit} className="space-y-3">
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
                <Select
                  value={propertyId || AUCUN}
                  onValueChange={choisirBien}
                  items={[{ value: AUCUN, label: t('noProperty') }, ...optionsBiens]}
                >
                  <SelectTrigger id="group-property" className="w-full">
                    <SelectValue placeholder={t('noProperty')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUCUN}>{t('noProperty')}</SelectItem>
                    {optionsBiens.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(biens.data?.meta.total ?? 0) > optionsBiens.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('contextTruncated', {
                      shown: optionsBiens.length,
                      total: biens.data?.meta.total ?? 0,
                    })}
                  </p>
                ) : null}
              </div>

              <div>
                <label className={LIBELLE} htmlFor="group-lease">
                  {t('leaseLabel')}
                </label>
                <Select
                  value={leaseId || AUCUN}
                  onValueChange={(v) => setLeaseId(!v || v === AUCUN ? '' : v)}
                  items={[{ value: AUCUN, label: t('noLease') }, ...optionsBaux]}
                >
                  <SelectTrigger id="group-lease" className="w-full">
                    <SelectValue placeholder={t('noLease')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUCUN}>{t('noLease')}</SelectItem>
                    {optionsBaux.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(baux.data?.meta.total ?? 0) > optionsBaux.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('contextTruncated', {
                      shown: optionsBaux.length,
                      total: baux.data?.meta.total ?? 0,
                    })}
                  </p>
                ) : null}
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
