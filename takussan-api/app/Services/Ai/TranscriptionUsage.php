<?php

namespace App\Services\Ai;

/**
 * TCK-2976 (ADR-0131 § 7) — un usage qui transcrit un fichier audio : il se joue par {@see AiGateway::transcribe()},
 * jamais par `run()` (patron d'{@see EmbeddingUsage}). Il n'a ni agent ni prompt (`agentClass()` lève). Il a TOUJOURS un
 * acteur : la passerelle juge son autorité. Le coupe-circuit, les plafonds et le journal restent entiers.
 */
interface TranscriptionUsage extends AiUsage {}
