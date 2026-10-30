'use client';

import { useState } from 'react';
import { ExternalLink, Lock, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  RADAR_SALUTATION_MAX,
  RADAR_SUMMARY_MAX,
  type RadarMessageSegment,
  type RadarOutreach,
  type RadarOutreachChanges,
} from '@/types/radar';
import { useMotifRadar } from './useMessageEchecAnnonceur';

interface ApercuMessageProps {
  readonly message: RadarOutreach;
  /** `ai_error` de la préparation, si l'écran l'a reçue : un code. Absent après un rechargement. */
  readonly erreurIa: string | null;
  /** Pas la prise en charge, STOP, ou geste en vol : le texte se lit, rien ne s'écrit ni ne s'envoie. */
  readonly desactive: boolean;
  readonly enRetouche: boolean;
  /** Un envoi est en vol, à la main ou par l'API. */
  readonly enEnvoi: boolean;
  readonly onRetoucher: (changes: RadarOutreachChanges) => void;
  readonly onEnvoye: () => void;
  /** TCK-2426 — `whatsapp_api_available` de la fiche : « Envoyer par l'API » n'existe que s'il est vrai. */
  readonly apiDisponible: boolean;
  /** TCK-2426 — une réponse reçue par l'API de l'annonceur attend son issue : l'API refuserait tout envoi (`reply_pending`) ; la fiche le dit. */
  readonly reponseEnAttente: boolean;
  readonly enEnvoiApi: boolean;
  readonly onEnvoyerApi: () => void;
}

const texteDe = (segments: readonly RadarMessageSegment[], kind: RadarMessageSegment['kind']) =>
  segments.find((s) => s.kind === kind)?.text ?? null;

/**
 * TCK-2388 — le message préparé, tel que l'API l'a composé. Les segments `fixed` (les clauses et le lien des
 * conditions) sont figés : fond atténué, cadenas, `aria-readonly`. La salutation et le résumé sont les deux
 * seuls champs, visiblement à part. **Le texte affiché est toujours celui de l'API** : les champs partent du
 * segment rendu, jamais d'une recomposition ; une retouche enregistrée se relit depuis la réponse (le parent
 * remonte ce composant avec une `key` qui suit le texte de l'API).
 *
 * WhatsApp n'ouvre QUE le texte enregistré : tant qu'une retouche n'est pas enregistrée, le lien et « J'ai
 * envoyé » restent fermés — sinon l'opérateur enverrait un texte différent de celui qu'il voit.
 *
 * TCK-2426 — « Envoyer par l'API » (offert si la fiche rend `whatsapp_api_available`) fait partir le message du numéro
 * du Radar, après confirmation. Il s'ouvre aux mêmes conditions que le lien `wa.me` (`wa_me_url` non nul : parties
 * écrites, numéro, ni STOP ni `send_blocked`). Tant qu'une réponse reçue par l'API de l'annonceur n'est pas tranchée,
 * aucun des trois gestes ne s'offre ; la fiche dit pourquoi.
 */
export function ApercuMessage({
  message,
  erreurIa,
  desactive,
  enRetouche,
  enEnvoi,
  onRetoucher,
  onEnvoye,
  apiDisponible,
  reponseEnAttente,
  enEnvoiApi,
  onEnvoyerApi,
}: ApercuMessageProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.message');
  const motifIa = useMotifRadar();
  /** Le geste qui attend la confirmation : « J'ai envoyé » (à la main) ou l'envoi par l'API. */
  const [confirmation, setConfirmation] = useState<'manuel' | 'api' | null>(null);

  const salutationApi = texteDe(message.segments, 'salutation');
  const resumeApi = texteDe(message.segments, 'resume');
  const retouchable = salutationApi !== null && resumeApi !== null;
  const [salutation, setSalutation] = useState(salutationApi ?? '');
  const [resume, setResume] = useState(resumeApi ?? '');

  const salutationModifiee = retouchable && salutation !== salutationApi;
  const resumeModifie = retouchable && resume !== resumeApi;
  const modifie = salutationModifiee || resumeModifie;
  const vide = (salutationModifiee && salutation.trim() === '') || (resumeModifie && resume.trim() === '');
  const partiesEcrites = message.salutation.trim() !== '' && message.summary.trim() !== '';

  const enregistrer = () => {
    // Seuls les champs modifiés partent : chaque clé envoyée est une retouche, et l'API refuse un corps vide.
    const changes: { salutation?: string; resume?: string } = {};
    if (salutationModifiee) changes.salutation = salutation;
    if (resumeModifie) changes.resume = resume;
    onRetoucher(changes);
  };

  const idSalutation = `radar-message-${message.id}-salutation`;
  const idResume = `radar-message-${message.id}-resume`;

  return (
    <article aria-label={t('heading')} className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-annonceur-apercu">
      <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
      <p className="text-xs text-muted-foreground">
        {t('listings', { ids: message.listing_ids.map((id) => t('number', { id })).join(', ') })}
      </p>

      {!partiesEcrites ? (
        <div role="status" className="rounded-lg border border-warning/60 bg-warning/5 p-3 text-sm text-foreground" data-testid="radar-annonceur-ia-absente">
          <p>{t('aiMissing')}</p>
          {erreurIa !== null ? <p className="mt-1 text-xs text-muted-foreground">{t('aiReason', { reason: motifIa(erreurIa) })}</p> : null}
        </div>
      ) : null}

      <div className="space-y-2" data-testid="radar-message-segments">
        {message.segments.map((segment, i) => {
          if (segment.kind === 'fixed') {
            return (
              <div
                key={i}
                role="textbox"
                aria-readonly="true"
                aria-multiline="true"
                aria-label={t('fixed')}
                data-kind="fixed"
                className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap text-muted-foreground"
              >
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{segment.text}</span>
              </div>
            );
          }
          const salut = segment.kind === 'salutation';
          return (
            <div key={i} className="space-y-1 rounded-md border-2 border-dashed border-primary/40 p-2" data-kind={segment.kind}>
              <Label htmlFor={salut ? idSalutation : idResume} className="text-xs font-medium text-foreground">
                {salut ? t('salutation') : t('resume')}
              </Label>
              <Textarea
                id={salut ? idSalutation : idResume}
                value={salut ? salutation : resume}
                maxLength={salut ? RADAR_SALUTATION_MAX : RADAR_SUMMARY_MAX}
                disabled={desactive}
                onChange={(event) => (salut ? setSalutation(event.target.value) : setResume(event.target.value))}
              />
            </div>
          );
        })}
      </div>
      {!retouchable ? <p className="text-xs text-muted-foreground">{t('legacy')}</p> : null}

      {retouchable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={desactive || enRetouche || !modifie || vide} onClick={enregistrer}>
            {enRetouche ? t('saving') : t('save')}
          </Button>
          {modifie ? <p className="text-xs text-muted-foreground">{t('unsaved')}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        {!desactive && !modifie && !reponseEnAttente && message.wa_me_url !== null ? (
          <a
            href={message.wa_me_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t('whatsapp')}
          </a>
        ) : null}
        {apiDisponible ? (
          <Button
            type="button"
            size="sm"
            disabled={desactive || modifie || reponseEnAttente || message.wa_me_url === null || enEnvoi}
            onClick={() => setConfirmation('api')}
          >
            <Send className="size-3.5" aria-hidden="true" />
            {enEnvoiApi ? t('apiSending') : t('apiSend')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          // L'envoi par l'API est le geste principal quand il s'offre : « J'ai envoyé » passe en second.
          variant={apiDisponible ? 'outline' : 'default'}
          disabled={desactive || modifie || !partiesEcrites || reponseEnAttente || enEnvoi}
          onClick={() => setConfirmation('manuel')}
        >
          {t('sent')}
        </Button>
      </div>
      {!partiesEcrites ? <p className="text-xs text-muted-foreground">{t('partsEmpty')}</p> : null}
      {message.send_blocked !== null ? (
        <p className="text-xs text-destructive" data-testid="radar-message-bloque">{t('blocked', { reason: motifIa(message.send_blocked) })}</p>
      ) : null}
      {message.wa_me_url !== null && !reponseEnAttente ? <p className="text-xs text-muted-foreground">{t('whatsappHint')}</p> : null}

      <Dialog open={confirmation !== null} onOpenChange={(ouvert) => { if (!enEnvoi && !ouvert) setConfirmation(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmation === 'api' ? t('apiTitle') : t('sentTitle')}</DialogTitle>
            <DialogDescription>{confirmation === 'api' ? t('apiBody') : t('sentBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={enEnvoi} onClick={() => setConfirmation(null)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={enEnvoi}
              onClick={() => {
                const geste = confirmation;
                // Un clic rejoué pendant la fermeture du dialogue n'a plus de geste : il n'envoie rien, surtout pas « J'ai envoyé ».
                if (geste === null) return;
                setConfirmation(null);
                if (geste === 'api') onEnvoyerApi();
                else onEnvoye();
              }}
            >
              {confirmation === 'api' ? t('apiConfirm') : enEnvoi ? t('sentSending') : t('sentConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
