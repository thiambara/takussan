'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
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
import { useBookingRequest } from '@/hooks/useBookingRequest';
import type { PropertyDetail } from '@/types/property';

interface PropertyReservationDialogProps {
  property: PropertyDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatPrice(price: number, currency: string | null): string {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency',
    currency: currency ?? 'XOF',
    maximumFractionDigits: 0,
  }).format(price);
}

export function PropertyReservationDialog({
  property,
  open,
  onOpenChange,
  onSuccess,
}: PropertyReservationDialogProps) {
  const { user } = useAuth();
  const { submit, submitting, error } = useBookingRequest(property.slug);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [guests, setGuests] = useState(1);
  const [message, setMessage] = useState('');

  const nights = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
    return Math.max(0, diff);
  }, [startDate, endDate]);

  const isRent = property.contract_type === 'rent';
  const total = isRent && nights > 0 ? property.price * nights : property.price;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await submit({
        start_date: startDate,
        end_date: endDate,
        guests,
        message: message || undefined,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // error already tracked by hook
    }
  }

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connectez-vous pour réserver</DialogTitle>
            <DialogDescription>
              Vous devez être connecté pour faire une demande de réservation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Link
              href={`/login?redirect=/properties/${property.slug}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 h-8 text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              Se connecter
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRent ? 'Réserver ce bien' : 'Faire une offre'}</DialogTitle>
          <DialogDescription>
            Précisez vos dates et le nombre d&apos;invités. Le propriétaire confirmera votre demande.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-stone-700">Arrivée</span>
              <Input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-stone-700">Départ</span>
              <Input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().slice(0, 10)}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-stone-700">Invités</span>
            <Input
              type="number"
              required
              min={1}
              max={20}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value) || 1)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-stone-700">Message (optionnel)</span>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Présentez-vous, expliquez votre projet…"
              rows={3}
            />
          </label>
          {nights > 0 && (
            <div className="rounded-md bg-stone-50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-stone-600">
                  {formatPrice(property.price, property.currency)} × {nights} nuit{nights > 1 ? 's' : ''}
                </span>
                <span className="text-stone-900">{formatPrice(total, property.currency)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1 border-t border-stone-200">
                <span>Total estimé</span>
                <span>{formatPrice(total, property.currency)}</span>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Envoi…' : 'Envoyer la demande'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
