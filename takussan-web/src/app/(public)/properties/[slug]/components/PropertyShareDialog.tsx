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
import { buildShareUrls, copyToClipboard } from '@/lib/share';

interface PropertyShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
}

export function PropertyShareDialog({ open, onOpenChange, title, url }: PropertyShareDialogProps) {
  const t = useTranslations('property.detail');
  const [copied, setCopied] = useState(false);
  const shares = buildShareUrls(title, url);

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
            className="flex-1 rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-700"
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
              className="flex flex-col items-center gap-1.5 rounded-md border border-stone-200 py-3 text-xs text-stone-700 hover:bg-stone-50 transition-colors"
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
