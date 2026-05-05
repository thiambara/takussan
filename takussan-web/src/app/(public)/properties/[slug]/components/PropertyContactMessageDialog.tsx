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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';
import { useContactMessage } from '@/hooks/useContactMessage';
import { submitContactLead } from '@/app/actions/property';

interface PropertyContactMessageDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PropertyContactMessageDialog({
  slug,
  open,
  onOpenChange,
}: PropertyContactMessageDialogProps) {
  const { user } = useAuth();
  if (user) {
    return <AuthenticatedDialog slug={slug} open={open} onOpenChange={onOpenChange} />;
  }
  return <AnonymousDialog slug={slug} open={open} onOpenChange={onOpenChange} />;
}

function AuthenticatedDialog({ slug, open, onOpenChange }: PropertyContactMessageDialogProps) {
  const router = useRouter();
  const { submit, submitting, error } = useContactMessage(slug);
  const t = useTranslations('publicContact');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      const { redirect_to } = await submit(message.trim());
      onOpenChange(false);
      setMessage('');
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

function AnonymousDialog({ slug, open, onOpenChange }: PropertyContactMessageDialogProps) {
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
    const res = await submitContactLead(slug, {
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
      toast.add({ title: t('errorTitle'), description: res.message || t('errorBody'), type: 'error' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700" htmlFor="lead-name">
              {t('name')}
            </label>
            <Input
              id="lead-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700" htmlFor="lead-email">
              {t('email')}
            </label>
            <Input
              id="lead-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700" htmlFor="lead-phone">
              {t('phone')}
            </label>
            <Input
              id="lead-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700" htmlFor="lead-message">
              {t('message')}
            </label>
            <Textarea
              id="lead-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('messagePlaceholder')}
              required
            />
            {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
          </div>
          {/* Honeypot — hidden from real users via aria-hidden + offscreen styles. */}
          <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
            <label htmlFor="lead-company">Company</label>
            <input
              id="lead-company"
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
