'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { createPrivacyRequest, privacyRequestKeys } from '@/lib/queries/privacy-requests';
import {
  PRIVACY_REQUEST_CHANNELS,
  PRIVACY_REQUEST_TYPES,
  type PrivacyRequest,
  type PrivacyRequestChannel,
  type PrivacyRequestType,
} from '@/types/privacy-request';

import { Champ, aujourdhui, decritPar, erreurDe } from './PrivacyRequestChamps';

/**
 * Saisir une demande de droits reçue (TCK-601 G).
 *
 * TCK-1198 (P104.03) — dans son propre fichier, chargé par `next/dynamic` à l'ouverture de son
 * dialogue : c'est le seul `DatePicker` de `/super-admin/privacy-requests`, et il faisait entrer
 * react-day-picker et date-fns (31,9 Kio gzip, mesure de l'explorateur) dans le JS initial de
 * l'écran. Garde : `src/app/__tests__/graphe-client-de-la-console.test.ts`.
 */
export function CreatePrivacyRequestForm({ onDone }: { readonly onDone: () => void }) {
  const t = useTranslations('superAdmin.privacyRequests');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const garde = useGardeDoubleFacteur();

  const [type, setType] = useState<PrivacyRequestType>('access');
  const [channel, setChannel] = useState<PrivacyRequestChannel>('email');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [userId, setUserId] = useState('');
  const [receivedAt, setReceivedAt] = useState(aujourdhui());

  const mutation = useMutation<PrivacyRequest, ApiError>({
    mutationFn: () => avecGardeDoubleFacteur(() => createPrivacyRequest({
      type,
      channel,
      requester_name: name.trim(),
      ...(contact.trim() ? { requester_contact: contact.trim() } : {}),
      ...(userId ? { user_id: Number(userId) } : {}),
      ...(receivedAt ? { received_at: receivedAt } : {}),
    }), garde),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: privacyRequestKeys.all });
      toast.add({ title: t('create.success'), type: 'success' });
      onDone();
    },
  });
  const erreur = mutation.error;

  const typeOptions = PRIVACY_REQUEST_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));
  const channelOptions = PRIVACY_REQUEST_CHANNELS.map((v) => ({ value: v, label: t(`channel.${v}`) }));

  function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  }

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <form onSubmit={soumettre} className="grid gap-4" noValidate>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription className="text-pretty">{t('create.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <span id="pr-type-label" className="text-sm font-medium">{t('fields.type')}</span>
            <Select value={type} onValueChange={(v) => v && setType(v as PrivacyRequestType)} items={typeOptions}>
              <SelectTrigger className="h-10 w-full" aria-labelledby="pr-type-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {erreurDe(erreur, 'type') ? <p className="text-xs text-destructive">{erreurDe(erreur, 'type')}</p> : null}
          </div>
          <div className="grid gap-1">
            <span id="pr-channel-label" className="text-sm font-medium">{t('fields.channel')}</span>
            <Select value={channel} onValueChange={(v) => v && setChannel(v as PrivacyRequestChannel)} items={channelOptions}>
              <SelectTrigger className="h-10 w-full" aria-labelledby="pr-channel-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channelOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {erreurDe(erreur, 'channel') ? <p className="text-xs text-destructive">{erreurDe(erreur, 'channel')}</p> : null}
          </div>
        </div>

        <Champ id="pr-name" label={t('fields.requesterName')} error={erreurDe(erreur, 'requester_name')}>
          <Input
            id="pr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={255}
            aria-invalid={!!erreurDe(erreur, 'requester_name')}
            aria-describedby={decritPar('pr-name', false, erreurDe(erreur, 'requester_name'))}
          />
        </Champ>

        <Champ
          id="pr-contact"
          label={t('fields.requesterContact')}
          hint={t('fields.requesterContactHint')}
          error={erreurDe(erreur, 'requester_contact')}
        >
          <Input
            id="pr-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={255}
            aria-invalid={!!erreurDe(erreur, 'requester_contact')}
            aria-describedby={decritPar('pr-contact', true, erreurDe(erreur, 'requester_contact'))}
          />
        </Champ>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <span className="text-sm font-medium">{t('fields.receivedAt')}</span>
            <DatePicker
              value={receivedAt}
              max={aujourdhui()}
              onValueChange={setReceivedAt}
              aria-label={t('fields.receivedAt')}
              buttonClassName="h-10 w-full"
            />
            {erreurDe(erreur, 'received_at') ? (
              <p className="text-xs text-destructive">{erreurDe(erreur, 'received_at')}</p>
            ) : null}
          </div>
          <Champ id="pr-user" label={t('fields.userId')} error={erreurDe(erreur, 'user_id')}>
            <Input
              id="pr-user"
              type="number"
              inputMode="numeric"
              min={1}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-invalid={!!erreurDe(erreur, 'user_id')}
              aria-describedby={decritPar('pr-user', false, erreurDe(erreur, 'user_id'))}
            />
          </Champ>
        </div>

        {erreur && !erreur.validationErrors ? (
          <p role="alert" className="text-sm text-destructive">{messageErreur(erreur, t('create.error'))}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>{tCommon('actions.cancel')}</Button>
          <Button type="submit" disabled={mutation.isPending || name.trim() === ''}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t('create.submit')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
