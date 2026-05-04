'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useReportProperty } from '@/hooks/useReportProperty';
import type { ReportPayload } from '@/types/visit';

interface PropertyReportButtonProps {
  slug: string;
}

const REASONS: Array<{ value: ReportPayload['reason']; label: string }> = [
  { value: 'spam', label: 'Spam' },
  { value: 'misleading', label: 'Annonce trompeuse' },
  { value: 'fraud', label: 'Arnaque / fraude' },
  { value: 'inappropriate_content', label: 'Contenu inapproprié' },
  { value: 'other', label: 'Autre' },
];

export function PropertyReportButton({ slug }: PropertyReportButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [reason, setReason] = useState<ReportPayload['reason']>('spam');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const { submit, submitting, error } = useReportProperty(slug);

  function handleClick(): void {
    if (!user) {
      setShowAuthGate(true);
      return;
    }
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await submit({ reason, details: details.trim() || undefined });
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setDetails('');
        setReason('spam');
      }, 1500);
    } catch {
      // error already tracked by hook
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors"
      >
        <Flag className="size-3.5" aria-hidden />
        Signaler cette annonce
      </button>

      {/* Auth gate dialog */}
      <Dialog open={showAuthGate} onOpenChange={setShowAuthGate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connexion requise</DialogTitle>
            <DialogDescription>
              Connectez-vous pour signaler cette annonce.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowAuthGate(false)}>
              Annuler
            </Button>
            <Link
              href={`/auth/login?redirect=/properties/${slug}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 h-8 text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              Se connecter
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report form dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Signaler cette annonce</DialogTitle>
            <DialogDescription>
              Aidez-nous à maintenir la qualité de la plateforme. Notre équipe examinera votre signalement.
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              Signalement envoyé. Merci !
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span className="text-stone-700">Motif</span>
                <Select
                  value={reason}
                  onValueChange={(v) => setReason((v as ReportPayload['reason']) ?? 'spam')}
                  items={REASONS}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-stone-700">Détails (optionnel)</span>
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Précisez les éléments problématiques…"
                  rows={3}
                  maxLength={1000}
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Envoi…' : 'Signaler'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
