'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

export interface AnonymousLeadPayload {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly message: string;
  readonly company?: string;
}

export interface AnonymousLeadResult {
  readonly ok: boolean;
  readonly message?: string;
}

interface AnonymousLeadDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** À qui la piste est destinée — bien, agent… Le dialogue ne le sait pas et n'a pas à le savoir. */
  readonly onSubmit: (payload: AnonymousLeadPayload) => Promise<AnonymousLeadResult>;
  /** Préfixe des `id` de champ : deux instances montées ensemble produiraient des `id` dupliqués. */
  readonly idPrefix?: string;
  readonly title?: string;
  readonly description?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Formulaire de contact ANONYME — le seul du site public, désormais partagé.
 *
 * Il vivait en dur dans `PropertyContactMessageDialog`. TCK-441 en a eu besoin une seconde fois
 * pour la fiche d'agent : le recopier aurait posé deux formulaires que rien n'oblige à rester
 * d'accord — et c'est exactement le motif que TCK-439 relève ailleurs dans la navbar.
 *
 * ⚠️ **Aucune authentification, et ce n'est pas un oubli.** Le régime du contact public de ce
 * dépôt est anonyme depuis TCK-161 ; la barrière est le `throttle` côté API et le pot de miel
 * ci-dessous, jamais un compte à créer.
 */
export function AnonymousLeadDialog({
  open,
  onOpenChange,
  onSubmit,
  idPrefix = 'lead',
  title,
  description,
}: AnonymousLeadDialogProps) {
  const t = useTranslations('publicContact');
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'message', string>>>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t('validation.nameRequired');
    if (!EMAIL_RE.test(email.trim())) next.email = t('validation.emailRequired');
    const trimmed = message.trim();
    if (trimmed.length < 5) next.message = t('validation.messageMin');
    else if (trimmed.length > 2000) next.message = t('validation.messageMax');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const res = await onSubmit({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      message: message.trim(),
      company: company || undefined,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.add({ title: t('successTitle'), description: t('successBody'), type: 'success' });
      onOpenChange(false);
      setName('');
      setEmail('');
      setPhone('');
      setMessage('');
    } else {
      toast.add({
        title: t('errorTitle'),
        description: res.message || t('errorBody'),
        type: 'error',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? t('title')}</DialogTitle>
          <DialogDescription>{description ?? t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-stone-700"
              htmlFor={`${idPrefix}-name`}
            >
              {t('name')}
            </label>
            <Input
              id={`${idPrefix}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-stone-700"
              htmlFor={`${idPrefix}-email`}
            >
              {t('email')}
            </label>
            <Input
              id={`${idPrefix}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-stone-700"
              htmlFor={`${idPrefix}-phone`}
            >
              {t('phone')}
            </label>
            <Input
              id={`${idPrefix}-phone`}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-stone-700"
              htmlFor={`${idPrefix}-message`}
            >
              {t('message')}
            </label>
            <Textarea
              id={`${idPrefix}-message`}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('messagePlaceholder')}
              required
            />
            {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
          </div>
          {/* Pot de miel — hors écran et `aria-hidden`, jamais `display:none` : un robot évite ce
              que le CSS cache complètement. */}
          <div
            aria-hidden="true"
            className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
          >
            <label htmlFor={`${idPrefix}-company`}>Company</label>
            <input
              id={`${idPrefix}-company`}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
