<?php

namespace App\Services\Kyc;

use App\Http\Requests\Api\Me\UploadKycAgentProfileRequest;
use App\Http\Requests\Api\Me\UploadKycOwnerProfileRequest;
use App\Http\Requests\Api\Me\UploadKycServiceProviderProfileRequest;
use App\Models\Document;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Onboarding\DemarrageDeLEspace;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2612 — la liste à faire des pièces d'un profil d'invité (bailleur, agent, prestataire) : `GET /api/me/pieces` la rend,
 * l'étape « Pièces » de « Démarrer » (et l'étape `kyc` du bailleur) la juge ({@see DemarrageDeLEspace}).
 *
 *  - Les pièces sont celles que les envois acceptent, dans leur ordre : les tables `KYC_KIND_TO_TYPE` des trois requêtes
 *    d'envoi. Le `code` est la sorte de l'envoi (`cni`, `rib`, `ninea`, `license`, `photo`, `insurance`).
 *  - Toutes sont REQUISES pour que l'étape soit faite, sauf l'assurance RC pro du prestataire. « Requise » ne bloque rien :
 *    aucune route ne refuse l'usage de l'espace faute de pièce.
 *  - L'état se lit sur le `Document` vivant du profil (une ligne par profil et par type, {@see ProfilePieces}) : `verified`
 *    quand `is_verified`, `sent` sinon, `missing` sans ligne. La vérification est portée PAR PIÈCE (`documents.is_verified`) ;
 *    aucun `KycDossier` n'existe pour un profil (relevé du 2026-11-11 : il n'est attaché qu'aux agences).
 *  - `rejected` fait partie du contrat mais n'est jamais rendu : rien ne consigne le refus d'une pièce de profil aujourd'hui
 *    (la vérification par l'agence est hors périmètre, famille 6).
 *  - Le NINEA du bailleur se tape (`owner_profiles.tax_id`, chiffré) ou se joint en fichier : l'un ou l'autre vaut « envoyé ».
 */
class PiecesDuProfil
{
    public const ETATS = ['missing', 'sent', 'verified', 'rejected'];

    /** Les pièces d'un profil, dans l'ordre de l'écran : celles que les envois acceptent. */
    private const PIECES = [
        OwnerProfile::class => UploadKycOwnerProfileRequest::KYC_KIND_TO_TYPE,
        AgentProfile::class => UploadKycAgentProfileRequest::KYC_KIND_TO_TYPE,
        ServiceProviderProfile::class => UploadKycServiceProviderProfileRequest::KYC_KIND_TO_TYPE,
    ];

    /** Les seules pièces facultatives. */
    private const FACULTATIVES = [
        ServiceProviderProfile::class => ['insurance'],
    ];

    /** Les pièces qui se tapent aussi, en numéro (`file_and_number`) : le numéro OU le fichier vaut envoyé. */
    private const AUSSI_EN_NUMERO = [
        OwnerProfile::class => ['ninea' => 'tax_id'],
    ];

    /** Le profil a-t-il une liste de pièces ? */
    public static function concerne(?Model $profil): bool
    {
        return $profil !== null && array_key_exists($profil::class, self::PIECES);
    }

    /**
     * @return list<array{code: string, required: bool, kind: string, state: string}>
     */
    public function pour(?Model $profil): array
    {
        if (! self::concerne($profil)) {
            return [];
        }
        $classe = $profil::class;

        /** @var array<string, bool> $verifiees type de pièce → vérifiée */
        $verifiees = Document::query()
            ->where('documentable_type', $classe)
            ->where('documentable_id', $profil->getKey())
            ->get(['type', 'is_verified'])
            ->mapWithKeys(fn (Document $d) => [($d->type instanceof \BackedEnum ? $d->type->value : (string) $d->type) => (bool) $d->is_verified])
            ->all();

        $pieces = [];
        foreach (self::PIECES[$classe] as $code => $type) {
            $colonne = self::AUSSI_EN_NUMERO[$classe][$code] ?? null;
            $saisi = $colonne !== null && filled($profil->getAttribute($colonne));
            $state = match (true) {
                ($verifiees[$type->value] ?? false) === true => 'verified',
                array_key_exists($type->value, $verifiees), $saisi => 'sent',
                default => 'missing',
            };

            $pieces[] = [
                'code' => $code,
                'required' => ! in_array($code, self::FACULTATIVES[$classe] ?? [], true),
                'kind' => $colonne !== null ? 'file_and_number' : 'file',
                'state' => $state,
            ];
        }

        return $pieces;
    }

    /** Toutes les pièces requises du profil sont envoyées ou vérifiées. Un profil sans liste n'a rien d'envoyé. */
    public function requisesEnvoyees(?Model $profil): bool
    {
        $pieces = $this->pour($profil);

        return $pieces !== [] && collect($pieces)
            ->where('required', true)
            ->every(fn (array $p) => in_array($p['state'], ['sent', 'verified'], true));
    }
}
