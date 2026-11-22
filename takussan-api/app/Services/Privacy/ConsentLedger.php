<?php

namespace App\Services\Privacy;

use App\Models\ConsentProof;
use App\Models\User;
use App\Services\Property\PublishReadiness;

/**
 * TCK-537 (AC1) — écrit la preuve d'un consentement : une ligne `consent_proofs` par document accepté,
 * à la version en vigueur. LA version est `PublishReadiness::TERMS_VERSION`, reflet côté API de
 * `VERSION_DOCUMENTS` (`takussan-web/src/content/legal/editeur.ts`, qui fait foi — décision du porteur
 * du 2026-11-16), tenu égal par `scripts/check-terms-version.mjs`.
 *
 * Les cases du produit disent « les conditions générales ET la politique de confidentialité » : les
 * deux documents sont prouvés ensemble, sauf appelant qui n'en présente qu'un.
 */
final class ConsentLedger
{
    public const CONTEXT_REGISTER = 'register';

    public const CONTEXT_HOST_ONBOARDING = 'host_onboarding';

    public const CONTEXT_OFFER = 'offer';

    public const CONTEXT_PUBLISH = 'publish';

    public const CONTEXT_PHONE_LOGIN = 'phone_login';

    public const CONTEXT_RADAR_CLAIM = 'radar_claim';

    /**
     * @param  list<string>  $documents
     */
    public function record(
        User $user,
        string $context,
        ?string $ip,
        array $documents = [ConsentProof::DOCUMENT_TERMS, ConsentProof::DOCUMENT_PRIVACY],
    ): void {
        $now = now();

        foreach ($documents as $document) {
            ConsentProof::query()->create([
                'user_id' => $user->id,
                'document' => $document,
                'version' => PublishReadiness::TERMS_VERSION,
                'context' => $context,
                'ip_address' => $ip,
                'accepted_at' => $now,
            ]);
        }
    }
}
