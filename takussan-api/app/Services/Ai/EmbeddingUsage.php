<?php

namespace App\Services\Ai;

/**
 * TCK-2423 (ADR-0076, amendement du 2026-10-31) — un usage qui demande des vecteurs : il se joue par
 * {@see AiGateway::embed()}, jamais par `run()`. Il n'a ni agent ni prompt (`agentClass()` lève), et tourne sans acteur :
 * une tâche planifiée, que personne ne demande. Le coupe-circuit, les plafonds, le masquage et le journal restent entiers.
 */
interface EmbeddingUsage extends AiUsage {}
