<?php

namespace App\Services\Model;

use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\User;
use Illuminate\Support\Str;

class DocumentShareLinkService
{
    /** @param array<string,mixed> $data */
    public function create(Document $document, User $actor, array $data = []): DocumentShareLink
    {
        return DocumentShareLink::create([
            'document_id' => $document->id,
            'created_by_id' => $actor->id,
            'token' => Str::uuid()->toString(),
            'expires_at' => $data['expires_at'] ?? now()->addDays(7),
            'max_downloads' => $data['max_downloads'] ?? null,
            'password_hash' => isset($data['password']) ? bcrypt($data['password']) : null,
            'downloads_count' => 0,
        ]);
    }

    public function validate(string $token, ?string $password = null): DocumentShareLink
    {
        $link = DocumentShareLink::where('token', $token)->firstOrFail();

        abort_if($link->revoked_at !== null, 410, 'This share link has been revoked.');
        abort_if($link->expires_at !== null && $link->expires_at->isPast(), 410, 'This share link has expired.');
        abort_if(
            $link->max_downloads !== null && $link->downloads_count >= $link->max_downloads,
            410,
            'This share link has reached its download limit.'
        );

        if ($link->password_hash !== null) {
            abort_unless(
                $password !== null && password_verify($password, $link->password_hash),
                401,
                'Invalid password.'
            );
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
