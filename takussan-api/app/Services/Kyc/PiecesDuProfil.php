<?php

namespace App\Services\Kyc;

use App\Http\Requests\Api\Me\UploadKycAgentProfileRequest;
use App\Http\Requests\Api\Me\UploadKycOwnerProfileRequest;
use App\Http\Requests\Api\Me\UploadKycServiceProviderProfileRequest;
use App\Http\Resources\Bases\BaseResource;
use App\Models\Document;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Onboarding\DemarrageDeLEspace;
use App\Support\Masking;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2612 — la liste à faire des pièces d'un profil d'invité (bailleur, agent, prestataire) : `GET /api/me/pieces` la rend,
 * l'étape « Pièces » de « Démarrer » (et l'étape `kyc` du bailleur) la juge ({@see DemarrageDeLEspace}).
 *
 *  - Les pièces sont celles que les envois acceptent, dans leur ordre : les tables `KYC_KIND_TO_TYPE` des trois requêtes
 *    d'envoi. Le `code` est la sorte de l'envoi (`cni`, `rib`, `ninea`, `license`, `photo`, `insurance`).
 *  - Toutes sont REQUISES pour que l'étape soit faite, sauf l'assurance RC pro du prestataire et — TCK-2614 (décision 2b,
 *    porteur, 2026-11-13) — le NINEA d'un bailleur qui n'est pas une société (`metadata.owner_type` ≠ `company`, la règle
 *    d'{@see OwnerProfile::companyName()}). « Requise » ne bloque rien : aucune route ne refuse l'usage de l'espace faute
 *    de pièce. `required` et {@see requisesEnvoyees()} lisent la même règle : l'écran et l'étape ne se contredisent pas.
 *  - L'état se lit sur le `Document` vivant du profil (une ligne par profil et par type, {@see ProfilePieces}) : `verified`
 *    quand `is_verified`, `sent` sinon, `missing` sans ligne. La vérification est portée PAR PIÈCE (`documents.is_verified`) ;
 *    aucun `KycDossier` n'existe pour un profil (relevé du 2026-11-11 : il n'est attaché qu'aux agences).
 *  - `rejected` fait partie du contrat mais n'est jamais rendu : rien ne consigne le refus d'une pièce de profil aujourd'hui
 *    (la vérification par l'agence est hors périmètre, famille 6).
 *  - Le NINEA du bailleur se tape (`owner_profiles.tax_id`, chiffré) ou se joint en fichier : l'un ou l'autre vaut « envoyé ».
 *  - TCK-2614 — `file` : le fichier vivant de la pièce (`name` tel qu'envoyé, `size` en octets, `sent_at` = l'ajout du
 *    média, que chaque remplacement renouvelle), `null` sans fichier (NINEA seulement tapé, pièce manquante). Il n'est
 *    lu que quand l'appelant le demande (`avecFichier`) : `GET /api/me/pieces` le demande pour le titulaire seul, jamais
 *    sous impersonation (ADR-0055 § 3, comme `DocumentPolicy::view`) ; l'étape de « Démarrer » ne le lit pas.
 *    Une pièce qui se tape aussi (`file_and_number`) porte avec lui `number_masked` : le numéro saisi sous sa forme
 *    masquée (`Masking::tail`, comme la réponse du `PATCH …/tax-id`), `null` sans numéro — jamais en clair (ADR-0070).
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
     * @param  bool  $avecFichier  ajoute `file` à chaque pièce (TCK-2614)
     * @return list<array{code: string, required: bool, kind: string, state: string, file?: array{name: string, size: int, sent_at: ?string}|null, number_masked?: ?string}>
     */
    public function pour(?Model $profil, bool $avecFichier = false): array
    {
        if (! self::concerne($profil)) {
            return [];
        }
        $classe = $profil::class;

        $documents = Document::query()
            ->where('documentable_type', $classe)
            ->where('documentable_id', $profil->getKey())
            ->when($avecFichier, fn ($q) => $q->with('media'))
            ->get($avecFichier ? ['id', 'type', 'is_verified', 'name'] : ['type', 'is_verified'])
            ->keyBy(fn (Document $d) => $d->type instanceof \BackedEnum ? $d->type->value : (string) $d->type);

        /** @var array<string, bool> $verifiees type de pièce → vérifiée */
        $verifiees = $documents->map(fn (Document $d) => (bool) $d->is_verified)->all();

        $pieces = [];
        foreach (self::PIECES[$classe] as $code => $type) {
            $colonne = self::AUSSI_EN_NUMERO[$classe][$code] ?? null;
            $saisi = $colonne !== null && filled($profil->getAttribute($colonne));
            $state = match (true) {
                ($verifiees[$type->value] ?? false) === true => 'verified',
                array_key_exists($type->value, $verifiees), $saisi => 'sent',
                default => 'missing',
            };

            $piece = [
                'code' => $code,
                'required' => ! self::facultative($profil, $code),
                'kind' => $colonne !== null ? 'file_and_number' : 'file',
                'state' => $state,
            ];
            if ($avecFichier) {
                $piece['file'] = self::fichier($documents->get($type->value));
                if ($colonne !== null) {
                    $piece['number_masked'] = $saisi ? Masking::tail((string) $profil->getAttribute($colonne)) : null;
                }
            }
            $pieces[] = $piece;
        }

        return $pieces;
    }

    /**
     * L'assurance RC pro du prestataire ; le NINEA du bailleur particulier (décision 2b) : il n'est requis que d'une société,
     * même règle que la raison sociale ({@see OwnerProfile::companyName()}). Un profil sans `owner_type` est un particulier.
     */
    private static function facultative(Model $profil, string $code): bool
    {
        if (in_array($code, self::FACULTATIVES[$profil::class] ?? [], true)) {
            return true;
        }

        return $profil instanceof OwnerProfile
            && $code === 'ninea'
            && data_get($profil->getAttribute('metadata'), 'owner_type') !== 'company';
    }

    /** @return array{name: string, size: int, sent_at: ?string}|null */
    private static function fichier(?Document $document): ?array
    {
        $media = $document?->getFirstMedia('file');
        if ($document === null || $media === null) {
            return null;
        }

        return [
            'name' => (string) ($document->name ?: $media->name),
            'size' => (int) $media->size,
            'sent_at' => BaseResource::instantOnWire($media->created_at),
        ];
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
