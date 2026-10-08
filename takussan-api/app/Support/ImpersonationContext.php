<?php

namespace App\Support;

/**
 * TCK-600 (ADR-0055 §5) — la session d'impersonation de la REQUÊTE COURANTE, s'il y en a une.
 *
 * Liée par `EnforceImpersonationReadOnly` quand le jeton de la requête appartient à une session
 * ouverte ; lue par `App\Models\Activity::creating`, qui pose `impersonator_id` sur toute activité écrite
 * pendant la session. Singleton de PORTÉE (`scoped`), vidé par le middleware en entrée et en sortie de requête.
 */
final class ImpersonationContext
{
    private ?int $sessionId = null;

    private ?int $impersonatorId = null;

    public function bind(int $sessionId, int $impersonatorId): void
    {
        $this->sessionId = $sessionId;
        $this->impersonatorId = $impersonatorId;
    }

    public function clear(): void
    {
        $this->sessionId = null;
        $this->impersonatorId = null;
    }

    public function active(): bool
    {
        return $this->sessionId !== null;
    }

    public function sessionId(): ?int
    {
        return $this->sessionId;
    }

    public function impersonatorId(): ?int
    {
        return $this->impersonatorId;
    }
}
