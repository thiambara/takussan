'use client';

import { useState } from 'react';
import { Mail, MessageSquareText, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AnonymousLeadDialog } from '@/components/public/AnonymousLeadDialog';
import { submitAgentContactLead } from '@/app/actions/property';
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
  /**
   * Adresse de contact d'ENTREPRISE, publiée délibérément — celle d'une agence.
   * ⚠️ TCK-441 : jamais l'adresse d'un utilisateur. Pour un agent, c'est `agentSlug` qu'on passe.
   */
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly subject?: string;
  /**
   * TCK-441 — quand il est fourni, le bouton « écrire » ouvre un formulaire de contact anonyme
   * au lieu d'un `mailto:`. C'est le chemin des fiches d'AGENT, dont l'adresse de connexion
   * n'est plus servie par l'API.
   *
   * ⚠️ « Anonyme » au sens strict : le formulaire ne demande aucun compte. Ce ticket ne rend
   * pas le contact plus difficile, il change seulement ce qui est publié.
   */
  readonly agentSlug?: string;
}

export function ContactSheet({ name, email, phone, subject, agentSlug }: ContactSheetProps) {
  const t = useTranslations('publicProfile.contact');
  const [leadOpen, setLeadOpen] = useState(false);
  const mailHref = email
    ? `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
    : null;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : null;

  return (
    <>
      {/* Desktop : boutons inline */}
      <div className="hidden md:flex md:flex-wrap md:gap-2">
        {agentSlug ? (
          <Button size="lg" onClick={() => setLeadOpen(true)}>
            <Mail aria-hidden />
            {t('email')}
          </Button>
        ) : (
          mailHref && (
            <Button size="lg" nativeButton={false} render={<a href={mailHref} />}>
              <Mail aria-hidden />
              {t('email')}
            </Button>
          )
        )}
        {telHref && (
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<a href={telHref} />}
          >
            <Phone aria-hidden />
            {t('call')}
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
                {t('contact')}
              </Button>
            }
          />
          <SheetContent side="bottom" className="rounded-t-3xl pb-8">
            <SheetHeader>
              <SheetTitle className="font-display text-2xl">{name}</SheetTitle>
              <SheetDescription>
                {t('sheetDescription')}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-3 px-4">
              {agentSlug ? (
                <Button
                  size="lg"
                  className="w-full min-h-14 justify-start gap-3 text-base"
                  onClick={() => setLeadOpen(true)}
                >
                  <Mail aria-hidden className="size-5" />
                  <span className="flex flex-col items-start leading-tight">
                    <span>{t('email')}</span>
                  </span>
                </Button>
              ) : (
                mailHref && (
                  <Button
                    size="lg"
                    nativeButton={false}
                    className="w-full min-h-14 justify-start gap-3 text-base"
                    render={<a href={mailHref} />}
                  >
                    <Mail aria-hidden className="size-5" />
                    <span className="flex flex-col items-start leading-tight">
                      <span>{t('email')}</span>
                      <span className="text-xs font-normal opacity-80">{email}</span>
                    </span>
                  </Button>
                )
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
                    <span>{t('call')}</span>
                    <span className="text-xs font-normal opacity-80">{phone}</span>
                  </span>
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {agentSlug && (
        <AnonymousLeadDialog
          open={leadOpen}
          onOpenChange={setLeadOpen}
          idPrefix="agent-lead"
          title={name}
          onSubmit={(payload) => submitAgentContactLead(agentSlug, payload)}
        />
      )}
    </>
  );
}
