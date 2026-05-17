'use client';

import { Mail, MessageSquareText, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface ContactSheetProps {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly subject?: string;
}

export function ContactSheet({ name, email, phone, subject }: ContactSheetProps) {
  const mailHref = email
    ? `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
    : null;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : null;

  return (
    <>
      {/* Desktop : boutons inline */}
      <div className="hidden md:flex md:flex-wrap md:gap-2">
        {mailHref && (
          <Button size="lg" nativeButton={false} render={<a href={mailHref} />}>
            <Mail aria-hidden />
            Envoyer un email
          </Button>
        )}
        {telHref && (
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<a href={telHref} />}
          >
            <Phone aria-hidden />
            Appeler
          </Button>
        )}
      </div>

      {/* Mobile : 1 CTA primaire pleine largeur → bottom sheet */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger
            render={
              <Button size="lg" className="w-full">
                <MessageSquareText aria-hidden />
                Contacter
              </Button>
            }
          />
          <SheetContent side="bottom" className="rounded-t-3xl pb-8">
            <SheetHeader>
              <SheetTitle className="font-display text-2xl">{name}</SheetTitle>
              <SheetDescription>
                Choisis ton canal pour entrer en contact.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-3 px-4">
              {mailHref && (
                <Button
                  size="lg"
                  nativeButton={false}
                  className="w-full min-h-14 justify-start gap-3 text-base"
                  render={<a href={mailHref} />}
                >
                  <Mail aria-hidden className="size-5" />
                  <span className="flex flex-col items-start leading-tight">
                    <span>Envoyer un email</span>
                    <span className="text-xs font-normal opacity-80">{email}</span>
                  </span>
                </Button>
              )}
              {telHref && (
                <Button
                  size="lg"
                  variant="outline"
                  nativeButton={false}
                  className="w-full min-h-14 justify-start gap-3 text-base"
                  render={<a href={telHref} />}
                >
                  <Phone aria-hidden className="size-5" />
                  <span className="flex flex-col items-start leading-tight">
                    <span>Appeler</span>
                    <span className="text-xs font-normal opacity-80">{phone}</span>
                  </span>
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
