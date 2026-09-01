'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useContactMessage } from '@/hooks/useContactMessage';
import { AnonymousLeadDialog } from '@/components/public/AnonymousLeadDialog';
import { submitContactLead } from '@/app/actions/property';

interface PropertyContactMessageDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * TCK-500 — le message déjà rédigé, modifiable et effaçable, posé comme VALEUR du champ.
   *
   * ⚠️ Ce dialogue n'est plus le chemin nominal d'un utilisateur connecté : celui-ci ouvre la
   * messagerie (panneau flottant, ou `/app/messages` sous le point de rupture `md`). La branche
   * authentifiée ci-dessous reste le REPLI — quand la résolution du fil n'a pas encore répondu,
   * ou quand la page est rendue hors du provider de messagerie. Elle garde donc le brouillon,
   * sans quoi le même clic donnerait un champ rempli ou vide selon la vitesse du réseau.
   */
  defaultMessage?: string;
}

export function PropertyContactMessageDialog({
  slug,
  open,
  onOpenChange,
  defaultMessage,
}: PropertyContactMessageDialogProps) {
  const { user } = useAuth();
  const props = { slug, open, onOpenChange, defaultMessage };
  return user ? <AuthenticatedDialog {...props} /> : <AnonymousDialog {...props} />;
}

function AuthenticatedDialog({
  slug,
  open,
  onOpenChange,
  defaultMessage,
}: PropertyContactMessageDialogProps) {
  const router = useRouter();
  const { submit, submitting, error } = useContactMessage(slug);
  const t = useTranslations('publicContact');
  // Initialiseur paresseux : posé au montage, jamais réimposé par-dessus une saisie.
  const [message, setMessage] = useState(defaultMessage ?? '');

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      const { redirect_to } = await submit(message.trim());
      onOpenChange(false);
      setMessage(defaultMessage ?? '');
      router.push(redirect_to);
    } catch {
      // error already tracked by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            required
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('messagePlaceholder')}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !message.trim()}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * TCK-441 — le formulaire lui-même vit dans `AnonymousLeadDialog`, partagé avec la fiche
 * d'agent. Ne reste ici que ce qui est propre au bien : la destination de la piste.
 */
function AnonymousDialog({
  slug,
  open,
  onOpenChange,
  defaultMessage,
}: PropertyContactMessageDialogProps) {
  return (
    <AnonymousLeadDialog
      open={open}
      onOpenChange={onOpenChange}
      idPrefix="lead"
      defaultMessage={defaultMessage}
      onSubmit={(payload) => submitContactLead(slug, payload)}
    />
  );
}
