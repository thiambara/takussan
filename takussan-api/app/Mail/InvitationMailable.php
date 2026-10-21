<?php

namespace App\Mail;

use App\Models\Invitation;
use App\Support\FrontendUrl;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-249 — invitation email (initial send + J+2 reminder).
 *
 * The same template renders both flavours; `$isReminder` only swaps the
 * subject so the recipient sees a different label in their inbox without
 * us maintaining two near-identical Blade files.
 *
 * Locale is set explicitly by the caller (InvitationService) via
 * `Mail::to(...)->locale($locale)` rather than from a User row, because
 * the recipient often has *no* User row yet at send time.
 */
class InvitationMailable extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Invitation $invitation,
        public readonly bool $isReminder = false,
    ) {}

    public function envelope(): Envelope
    {
        $key = $this->isReminder
            ? 'notifications.invitation.reminder_subject'
            : 'notifications.invitation.subject';

        return new Envelope(subject: __($key));
    }

    public function content(): Content
    {
        // Build the public accept URL on the frontend (P97.05, TCK-1185 : `FrontendUrl`, la base
        // commune des liens du front).
        $acceptUrl = FrontendUrl::to('/invitations/accept?token='.$this->invitation->token);

        return new Content(
            view: 'emails.invitation',
            with: [
                'invitation' => $this->invitation,
                'acceptUrl' => $acceptUrl,
                'isReminder' => $this->isReminder,
                'expiresAt' => $this->invitation->expires_at,
            ],
        );
    }
}
