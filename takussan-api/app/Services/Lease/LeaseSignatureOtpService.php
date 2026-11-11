<?php

namespace App\Services\Lease;

use App\Services\Signature\SignatureOtpService;

/**
 * TCK-596 §4B (ADR-0042 §2) — le code à usage unique d'une signature de bail.
 *
 * TCK-2646 — le mécanisme est extrait dans {@see SignatureOtpService}, que l'état des lieux signé sur
 * place emploie aussi (ADR-0098 §4). Cette classe reste le nom par lequel le bail le demande : mêmes
 * bornes, mêmes clés de cache (`lease-signature-{kind}:{bail}:{user}:{role}`), mêmes constantes.
 */
class LeaseSignatureOtpService extends SignatureOtpService {}
