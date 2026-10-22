<?php

namespace App\Services\Notifications\Sms;

use App\Jobs\SendDeferredSmsJob;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\LeasePaymentLink;
use App\Services\Payments\LeasePaymentLinkService;

/**
 * TCK-1346 (P132.04) — ce qu'un SMS porteur de lien doit relire avant de partir.
 *
 * Entre 22 h et 6 h, le routeur remet le texte DÉJÀ RENDU à {@see SendDeferredSmsJob},
 * qui l'envoie au matin. Une invitation révoquée ou relancée (jeton neuf), un lien de paiement
 * régénéré ou révoqué pendant la nuit ne valent plus rien : le SMS de 6 h mènerait à un 410. La
 * garde voyage dans le contexte du SMS (`deferred_guard`) et ne porte que des identifiants et un
 * jeton HACHÉ — jamais le jeton.
 *
 * Une garde de type inconnu laisse partir le message : elle ne retient que ce qu'elle sait juger.
 */
final class DeferredSmsGuard
{
    public const CONTEXT_KEY = 'deferred_guard';

    /** @return array{type: string, id: int, token_hash: string} */
    public static function forInvitation(Invitation $invitation): array
    {
        return ['type' => 'invitation', 'id' => (int) $invitation->getKey(), 'token_hash' => hash('sha256', (string) $invitation->token)];
    }

    /** @return array{type: string, token_hash: string} le lien `…/pay/{jeton}` qu'émet {@see LeasePaymentLinkService} */
    public static function forPayLink(string $url): array
    {
        $token = (string) preg_replace('#^.*/pay/#', '', (string) strtok($url, '?'));

        return ['type' => 'pay_link', 'token_hash' => LeasePaymentLink::hashToken($token)];
    }

    /** @param  array<string, mixed>  $guard */
    public function stillValid(array $guard): bool
    {
        return match ($guard['type'] ?? null) {
            'invitation' => $this->invitationStillValid((int) ($guard['id'] ?? 0), (string) ($guard['token_hash'] ?? '')),
            'pay_link' => app(LeasePaymentLinkService::class)->isLive((string) ($guard['token_hash'] ?? '')),
            default => true,
        };
    }

    /** Les règles de `InvitationService::lookupActiveInvitation`, sans lever. */
    private function invitationStillValid(int $id, string $tokenHash): bool
    {
        $invitation = Invitation::query()->find($id);

        return $invitation !== null
            && hash_equals(hash('sha256', (string) $invitation->token), $tokenHash)
            && $invitation->status === InvitationStatus::Sent
            && ($invitation->expires_at === null || $invitation->expires_at->isFuture());
    }
}
