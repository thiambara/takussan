<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\PayoutMethod;
use App\Services\Media\PrivateMediaAccess;
use App\Support\ImpersonationContext;
use Illuminate\Http\Request;

/**
 * TCK-594 (ADR-0039 §6) — la forme masquée pour tous ; la forme claire au TITULAIRE seul.
 *
 * `verified` dit si la destination peut servir AU LECTEUR (VERIF-594 M-6) : pour le personnel d'une
 * agence, vérifiée par son agence ; pour le titulaire, vérifiée par au moins une agence. Le lecteur
 * ne voit jamais quelles autres agences ont vérifié.
 *
 * TCK-714 (P03.04) — sous impersonation, le « titulaire » est l'opérateur qui agit pour lui :
 * `account_identifier` sort alors masqué (quatre derniers caractères), jamais en clair.
 */
class PayoutMethodResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $holder = $request->user()?->id === $this->user_id;
        $agencyId = $holder ? null : $request->user()?->staffAgencyId();
        $verification = $holder
            ? ($this->resource->relationLoaded('verifications')
                ? $this->resource->verifications->sortByDesc('verified_at')->first()
                : $this->resource->verifications()->latest('verified_at')->first())
            : ($agencyId !== null ? $this->resource->verificationFor((int) $agencyId) : null);

        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'kind' => $this->kind?->value,
            'masked_identifier' => $this->masked_identifier,
            'account_identifier' => $this->when($holder, fn () => app(ImpersonationContext::class)->active()
                ? PayoutMethod::mask((string) $this->account_identifier)
                : $this->account_identifier),
            'account_holder_name' => $this->when($holder, fn () => $this->account_holder_name),
            'is_default' => (bool) $this->is_default,
            'verified' => $verification !== null,
            'verified_at' => $this->iso($verification?->verified_at),
            // TCK-2863 — `verified`, `in_review` (RIB envoyé, pas encore vérifié) ou `to_confirm`.
            // « En revue » est informatif : seul `verified` permet de verser.
            'verification_status' => match (true) {
                $verification !== null => 'verified',
                $this->bank_statement_submitted_at !== null => 'in_review',
                default => 'to_confirm',
            },
            'bank_statement_submitted_at' => $this->iso($this->bank_statement_submitted_at),
            // TCK-2863 — le média du RIB : le titulaire, et le personnel de l'agence qui le paie
            // (celui qui vérifie, `MediaPolicy::sign`).
            'bank_statement_media_id' => $this->resource->getFirstMedia(PayoutMethod::BANK_STATEMENT_COLLECTION)?->id,
            'bank_statement_url' => $this->bankStatementUrl($request),
            'created_at' => $this->iso($this->created_at),
        ];
    }

    /**
     * TCK-2463 — l'URL d'API signée du RIB (`PrivateMediaAccess::signedUrl()`, route
     * `media.private.show`), pour qui peut le lire, sinon `null`. Elle remplace
     * `GET /api/media/{id}/sign`, qui signait pour un CDN jamais provisionné : la route rendait un
     * chemin relatif que rien ne servait. Jamais sous impersonation : le RIB porte le numéro en
     * clair, que `account_identifier` masque déjà pour l'opérateur (TCK-714).
     */
    private function bankStatementUrl(Request $request): ?string
    {
        $media = $this->resource->getFirstMedia(PayoutMethod::BANK_STATEMENT_COLLECTION);
        if ($media === null || app(ImpersonationContext::class)->active()
            || $request->user()?->can('sign', $media) !== true) {
            return null;
        }

        return app(PrivateMediaAccess::class)->signedUrl($media);
    }
}
