<?php

namespace App\Models\Enums;

/**
 * TCK-2383 (ADR-0076 §2) — le code demande un RÔLE de modèle, jamais un modèle. L'affectation d'un
 * rôle à une chaîne de modèles se règle dans la console (`ai_role_assignments`), à défaut dans
 * `config/ai.php`.
 */
enum AiModelRole: string
{
    case Extraction = 'extraction';
    case Redaction = 'redaction';
    case Raisonnement = 'raisonnement';
    case Vision = 'vision';
    case Embedding = 'embedding';
}
