<?php

namespace App\Services\Review;

use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use App\Support\VisitorFingerprint;
use Illuminate\Support\Facades\DB;

/**
 * TCK-597 (ADR-0043 §6) — signaler un avis, avec ou sans compte. Une seule écriture pour la route
 * authentifiée et la route publique.
 *
 * Le dédoublonnage se fait par COMPTE quand l'auteur est connecté, sinon par EMPREINTE visiteur
 * ({@see VisitorFingerprint}) : le même visiteur qui signale deux fois ne fait monter
 * `reported_count` que d'une unité. La ligne de l'avis est verrouillée : deux envois simultanés ne
 * passent pas tous les deux le contrôle.
 */
class ReviewReportService
{
    /**
     * Un signalement RANGE l'avis dans la file de modération (`reported`) ; il ne le masque jamais :
     * `is_approved` ne bouge pas, l'avis reste publié et la moyenne publique avec. Un faux
     * signalement coûte donc une relecture, pas une sanction — un seul suffit. Ce n'est pas un
     * réglage : `config('takussan.reviews.report_threshold')` était lu sans qu'aucun fichier ne le
     * déclare jamais.
     */
    public const REPORTED_THRESHOLD = 1;

    /** Rend `true` si un signalement neuf a été enregistré, `false` si ce visiteur l'avait déjà fait. */
    public function report(Review $review, ?User $user, ?string $fingerprint, string $reason): bool
    {
        return DB::transaction(function () use ($review, $user, $fingerprint, $reason): bool {
            $review = Review::query()->whereKey($review->getKey())->lockForUpdate()->firstOrFail();
            // verif-597 m3 — seul un avis PUBLIÉ se signale, sur les DEUX routes : un avis en attente
            // n'existe pas pour qui signale. La route authentifiée le faisait passer `pending →
            // reported` et révélait qu'un identifiant existait.
            abort_unless($review->is_approved, 404);

            $metadata = $review->metadata ?? [];
            $reports = $metadata['reports'] ?? [];

            $already = collect($reports)->contains(fn (array $r): bool => $user !== null
                ? (int) ($r['user_id'] ?? 0) === $user->id
                : ($r['user_id'] ?? null) === null && $fingerprint !== null && ($r['fingerprint'] ?? null) === $fingerprint);

            if ($already) {
                return false;
            }

            $reports[] = [
                'user_id' => $user?->id,
                'fingerprint' => $fingerprint,
                'reason' => $reason,
                'reported_at' => now()->toISOString(),
            ];
            $metadata['reports'] = $reports;
            $metadata['reported'] = true;

            $attrs = [
                'metadata' => $metadata,
                'reported_count' => ($review->reported_count ?? 0) + 1,
            ];

            $status = $review->status ?? ReviewStatus::Pending;
            if ($attrs['reported_count'] >= self::REPORTED_THRESHOLD
                && $status !== ReviewStatus::Rejected
                && $status->canTransitionTo(ReviewStatus::Reported)) {
                $attrs['status'] = ReviewStatus::Reported;
            }

            $review->update($attrs);

            return true;
        });
    }
}
