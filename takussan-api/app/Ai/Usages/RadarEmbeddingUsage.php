<?php

namespace App\Ai\Usages;

use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiDataGuard;
use App\Services\Ai\EmbeddingUsage;
use LogicException;

/**
 * TCK-2423 (ADR-0076, amendement du 2026-10-31) — la représentation numérique du texte comparé d'une annonce du Radar
 * (`radar_listings.similarity_text`), pour le quatrième signal de rapprochement.
 *
 * - Classe `publique` : le texte vient d'une annonce publiée ailleurs, et la passerelle y masque les numéros
 *   ({@see AiDataGuard::prepare()}), comme pour un modèle.
 * - Pas de contenu externe au sens d'ADR-0076 §10 : le fournisseur rend des nombres, aucune consigne ne peut s'y exécuter.
 * - `promptVersion()` : il n'y a pas de prompt, la colonne du journal porte la version de cette composition.
 * - Aucun cache : l'empreinte du contenu, dans `embeddings`, en tient lieu.
 */
final class RadarEmbeddingUsage implements EmbeddingUsage
{
    public const KEY = 'radar.embedding';

    public function key(): string
    {
        return self::KEY;
    }

    public function role(): AiModelRole
    {
        return AiModelRole::Embedding;
    }

    public function agentClass(): string
    {
        throw new LogicException('Un usage d\'embeddings se joue par AiGateway::embed().');
    }

    public function promptVersion(): int
    {
        return 1;
    }

    public function maxDataClass(): AiDataClass
    {
        return AiDataClass::Publique;
    }

    public function authority(): Capability|PlatformAbility
    {
        return PlatformAbility::RadarOperate;
    }

    /** 1 $ par jour, au tarif du modèle par défaut : environ 16 millions de tokens, soit bien plus qu'un balayage n'en lit. */
    public function dailyBudgetUsd(): ?string
    {
        return '1.00';
    }

    public function cacheTtlSeconds(): int
    {
        return 0;
    }

    public function readsExternalContent(): bool
    {
        return false;
    }
}
