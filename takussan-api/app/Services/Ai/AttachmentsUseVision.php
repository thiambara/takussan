<?php

namespace App\Services\Ai;

use App\Models\Enums\AiModelRole;

/**
 * TCK-2386 (ADR-0076 §2) — marqueur d'un usage dont les pièces jointes (captures d'écran) se lisent
 * par le rôle `vision`. Quand une `AiRequest` porte des pièces jointes et que son usage implémente
 * ce marqueur, `AiGateway` joue la chaîne du rôle {@see AiModelRole::Vision} et journalise ce rôle ;
 * sans pièce jointe, l'usage garde le sien. Le modèle forcé de l'usage s'applique dans les deux cas.
 */
interface AttachmentsUseVision {}
