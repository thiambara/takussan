'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Mail, MessageCircle, Share2, X as XIcon, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { copyToClipboard, liensDePartage } from '@/lib/share';
import { formatCurrency } from '@/lib/format/currency';
import type { PropertyDetail } from '@/types/property';

interface PropertyShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Pick<PropertyDetail, 'type' | 'price' | 'currency' | 'location'>;
  /** L'adresse de la fiche, SANS requête : chaque canal y ajoute sa propre source. */
  url: string;
}

/**
 * TCK-590 — le texte partagé dit ce qu'est le bien, dans la langue du visiteur : type · prix en
 * F CFA · quartier, puis le lien signé de son canal (`utm_source=<canal>&utm_medium=share`). Il
 * n'envoyait que le titre — saisi par l'annonceur, dans sa langue à lui — et l'adresse nue.
 *
 * Le prix suit la devise du bien, jamais une conversion : pas de prix en devise étrangère
 * (décision du porteur, 2026-10-06).
 */
export function PropertyShareDialog({ open, onOpenChange, property, url }: PropertyShareDialogProps) {
  const t = useTranslations('property.detail');
  const tTypes = useTranslations('property.types');
  const tContact = useTranslations('propertyContact.share');
  const [copied, setCopied] = useState(false);

  const type = tTypes(property.type);
  const price = formatCurrency(property.price, property.currency ?? 'XOF');
  const quarter = property.location.quarter?.trim() || property.location.city?.trim() || '';
  const texte = (lien: string) =>
    quarter
      ? tContact('text', { type, price, quarter, url: lien })
      : tContact('textNoQuarter', { type, price, url: lien });
  const shares = liensDePartage(texte, tContact('subject', { type }), url);

  async function handleCopy(): Promise<void> {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const channels: Array<{ label: string; href: string; icon: React.ComponentType<{ className?: string }> }> = [
    { label: 'WhatsApp', href: shares.whatsapp, icon: MessageCircle },
    { label: 'Facebook', href: shares.facebook, icon: Share2 },
    { label: 'X', href: shares.twitter, icon: XIcon },
    { label: 'Email', href: shares.email, icon: Mail },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('shareDialog.title')}</DialogTitle>
          <DialogDescription>{t('shareDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground"
            aria-label={t('shareDialog.linkAria')}
          />
          <Button type="button" variant="outline" onClick={handleCopy} className="gap-2 shrink-0">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t('shareDialog.copied') : t('shareDialog.copy')}
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {channels.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-md border border-border py-3 text-xs text-foreground hover:bg-muted/60 transition-colors"
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
