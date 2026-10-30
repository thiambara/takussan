<?php

namespace App\Ai\Usages;

use App\Ai\Agents\RadarConsentVerification;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;
use App\Services\Ai\AttachmentsUseVision;

/**
 * TCK-2388 (ADR-0077 §3) — lire les captures de la réponse d'un annonceur et en proposer le verdict.
 *
 * - Classe `personnelle` : la passerelle ne masque pas les numéros, la vérification doit lire celui de l'interlocuteur.
 * - Contenu externe (ADR-0076 §10) : les captures, reçues en pièces jointes, agent sans outil.
 * - Des captures jointes jouent la chaîne `vision` (`AttachmentsUseVision`), comme l'extraction ; une réponse sans
 *   capture (le message reçu par l'API du Radar, TCK-2395) joue `raisonnement`.
 * - Le verdict n'ouvre rien : un humain confirme, et seule sa confirmation rend l'accord valide.
 * - Aucun cache : un usage non public n'y entre jamais.
 */
final class RadarConsentVerificationUsage implements AiUsage, AttachmentsUseVision
{
    public const KEY = 'radar.verification_accord';

    public function key(): string
    {
        return self::KEY;
    }

    public function role(): AiModelRole
    {
        return AiModelRole::Raisonnement;
    }

    public function agentClass(): string
    {
        return RadarConsentVerification::class;
    }

    /** TCK-2395 : `v2` = `v1` + la réponse reçue en texte par l'API (la partie « captures » est inchangée, mot pour mot). */
    public function promptVersion(): int
    {
        return 2;
    }

    public function maxDataClass(): AiDataClass
    {
        return AiDataClass::Personnelle;
    }

    public function authority(): Capability|PlatformAbility
    {
        return PlatformAbility::RadarOperate;
    }

    public function dailyBudgetXof(): ?float
    {
        return 1500.0;
    }

    public function cacheTtlSeconds(): int
    {
        return 0;
    }

    public function readsExternalContent(): bool
    {
        return true;
    }
}
