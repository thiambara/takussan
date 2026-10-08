<?php

namespace App\Services\Model;

use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class DocumentShareLinkService
{
    /** TCK-602 (ADR-0051 §7) — 32 octets aléatoires, en base64url : 43 caractères. */
    public const TOKEN_BYTES = 32;

    /** Mots de passe faux tolérés par lien, toutes adresses confondues, sur la fenêtre. */
    public const PASSWORD_MAX_ATTEMPTS = 5;

    public const PASSWORD_DECAY_SECONDS = 900;

    /** @param array<string,mixed> $data */
    public function create(Document $document, User $actor, array $data = []): DocumentShareLink
    {
        return DocumentShareLink::create([
            'document_id' => $document->id,
            'created_by_id' => $actor->id,
            'token' => rtrim(strtr(base64_encode(random_bytes(self::TOKEN_BYTES)), '+/', '-_'), '='),
            'expires_at' => $data['expires_at'] ?? now()->addDays(7),
            'max_downloads' => $data['max_downloads'] ?? null,
            'password_hash' => isset($data['password']) ? bcrypt($data['password']) : null,
            'downloads_count' => 0,
        ]);
    }

    public function validate(string $token, ?string $password = null): DocumentShareLink
    {
        // TCK-602 — recherche par l'empreinte : le jeton en clair n'est plus en base.
        $hash = DocumentShareLink::hashToken($token);
        $link = DocumentShareLink::query()->where('token_hash', $hash)->firstOrFail();
        abort_if(! hash_equals((string) $link->token_hash, $hash), 404);

        abort_code_if($link->revoked_at !== null, 410, 'share_link.revoked');
        abort_code_if($link->expires_at !== null && $link->expires_at->isPast(), 410, 'share_link.expired');
        abort_code_if(
            $link->max_downloads !== null && $link->downloads_count >= $link->max_downloads,
            410,
            'share_link.download_limit'
        );

        if ($link->password_hash !== null) {
            // TCK-602 (ADR-0051 §7) — les essais faux se comptent PAR LIEN, quelle que soit
            // l'adresse : un limiteur par IP se contourne en changeant d'adresse. Au-delà, même
            // le bon mot de passe attend la fin de la fenêtre.
            // VERIF-602 m1 — l'essai est compté AVANT d'être évalué, par l'incrément atomique du
            // cache, et c'est la valeur qu'il rend qui décide : des requêtes simultanées ne passent
            // plus toutes un contrôle lu avant le premier compte. Le bon mot de passe rend son essai.
            $key = 'share-password:'.$link->getKey();
            $attempt = RateLimiter::hit($key, self::PASSWORD_DECAY_SECONDS);
            abort_code_if($attempt > self::PASSWORD_MAX_ATTEMPTS, 429, 'share_link.too_many_attempts');
            if ($password === null || ! Hash::check($password, $link->password_hash)) {
                abort_code(401, 'share_link.password_invalid');
            }
            RateLimiter::decrement($key, self::PASSWORD_DECAY_SECONDS);
        }

        return $link;
    }

    public function recordDownload(DocumentShareLink $link): void
    {
        $link->increment('downloads_count');
        $link->update(['last_accessed_at' => now()]);
    }

    public function revoke(DocumentShareLink $link): void
    {
        $link->update(['revoked_at' => now()]);
    }
}
