'use client';
import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useVisitRequest } from '@/hooks/useVisitRequest';
import type { VisitType } from '@/types/visit';

interface PropertyVisitDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const VISIT_TYPES: Array<{ value: VisitType; label: string }> = [
  { value: 'in_person', label: 'En personne' },
  { value: 'virtual', label: 'Virtuelle (visio)' },
  { value: 'self_guided', label: 'Autonome (clés)' },
  { value: 'hybrid', label: 'Hybride' },
];

export function PropertyVisitDialog({ slug, open, onOpenChange, onSuccess }: PropertyVisitDialogProps) {
  const { user } = useAuth();
  const { submit, submitting, error } = useVisitRequest(slug);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [type, setType] = useState<VisitType>('in_person');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!date) return;
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    try {
      await submit({
        scheduled_at: scheduledAt,
        type,
        notes: notes || undefined,
        ...(user
          ? {}
          : {
              visitor_name: name,
              visitor_email: email,
              visitor_phone: phone || undefined,
            }),
      });
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // error already tracked by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Demander une visite</DialogTitle>
          <DialogDescription>
            Choisissez une date et un créneau — le propriétaire confirmera rapidement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-stone-700">Date</span>
              <Input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-stone-700">Heure</span>
              <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-stone-700">Type de visite</span>
            <Select value={type} onValueChange={(v) => setType((v as VisitType) ?? 'in_person')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {!user && (
            <div className="space-y-3">
              <Input
                type="text"
                required
                placeholder="Votre nom"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="tel"
                placeholder="Téléphone (optionnel)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}
          <label className="block space-y-1 text-sm">
            <span className="text-stone-700">Message (optionnel)</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Précisions pour le propriétaire…"
              rows={3}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Envoi…' : 'Demander la visite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
