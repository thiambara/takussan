<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Translation\PotentiallyTranslatedString;
use Illuminate\Validation\Rule;

/**
 * TCK-076 — sign an inventory as either the tenant or the landlord.
 *
 * Payload (both fields required):
 *   - `role`       : "tenant" | "landlord"
 *   - `signature`  : PNG data URL, e.g. "data:image/png;base64,iVBORw0KGgo...".
 *                    Strict validation (see `SignatureDataUrlRule`):
 *                    - MUST begin with "data:image/png;base64," (the browser
 *                      canvas API always emits this prefix).
 *                    - MUST carry a non-empty, well-formed base64 payload.
 *                    - MUST stay under `MAX_SIGNATURE_BYTES`.
 *
 * Rejecting arbitrary strings is essential: the raw payload is later embedded
 * as `<img src="{{ $signature }}">` in the dompdf template. Accepting e.g.
 * `signature = "file:///etc/passwd"` or `"http://attacker/x.png"` would turn
 * the PDF pipeline into an LFI / SSRF / tracking vector (even with
 * `is_remote_enabled=false`, dompdf still resolves local file paths).
 *
 * Authorisation (tenant vs landlord link) is enforced downstream in
 * `InventorySignatureService::sign()` — it needs the inventory context that is
 * not available here.
 */
class InventorySignRequest extends FormRequest
{
    public const ROLE_TENANT = 'tenant';

    public const ROLE_LANDLORD = 'landlord';

    public const ROLES = [self::ROLE_TENANT, self::ROLE_LANDLORD];

    /**
     * Hard cap on the raw signature payload (2 MB) — covers a generous
     * base64-encoded PNG canvas while blocking obvious abuse.
     */
    public const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

    /**
     * The only data URL prefix we accept. `canvas.toDataURL('image/png')`
     * always emits this exact string; anything else is either a forged client
     * or a malicious payload attempting to embed a non-image resource.
     */
    public const SIGNATURE_PREFIX = 'data:image/png;base64,';

    /**
     * Minimum decoded bytes for a valid PNG. The smallest possible PNG (a 1×1
     * pixel, IHDR + IDAT + IEND) is ~67 bytes. Anything below that cannot be
     * a legitimate signature image. Empty-canvas detection beyond this is a
     * client-side concern (the frontend `SignaturePad` gates confirm on
     * `hasInk`) — server-side we only guarantee the bytes are a PNG.
     */
    public const MIN_DECODED_BYTES = 67;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'role' => ['required', Rule::in(self::ROLES)],
            'signature' => [
                'required',
                'string',
                'max:'.self::MAX_SIGNATURE_BYTES,
                new SignatureDataUrlRule,
            ],
        ];
    }
}

/**
 * Validates a PNG data URL carrying a non-trivial base64 payload.
 *
 * Kept as a local class (PSR-4 tolerates multiple classes per file since PHP
 * doesn't enforce one-class-per-file and the Laravel autoloader pins the
 * request class to the filename). This rule is only ever used by
 * `InventorySignRequest` — no need to pollute `App\Rules\`.
 */
class SignatureDataUrlRule implements ValidationRule
{
    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        if (! is_string($value) || $value === '') {
            $this->bail($fail, 'La signature est invalide.');

            return;
        }

        if (! str_starts_with($value, InventorySignRequest::SIGNATURE_PREFIX)) {
            $this->bail($fail, 'La signature doit être un PNG base64 (data:image/png;base64,...).');

            return;
        }

        $base64 = substr($value, strlen(InventorySignRequest::SIGNATURE_PREFIX));

        // strict base64 — rejects `file://`, `http://`, control characters,
        // and anything that isn't a legitimate canvas.toDataURL() payload.
        if ($base64 === '' || preg_match('/^[A-Za-z0-9+\/]+={0,2}$/', $base64) !== 1) {
            $this->bail($fail, 'La signature contient des caractères base64 invalides.');

            return;
        }

        $decoded = base64_decode($base64, true);
        if ($decoded === false || strlen($decoded) < InventorySignRequest::MIN_DECODED_BYTES) {
            $this->bail($fail, 'La signature est vide ou trop petite.');

            return;
        }

        // Verify the PNG magic bytes so an attacker cannot smuggle another
        // binary format (SVG with <script>, HTML, JS) behind the PNG label.
        $magic = substr($decoded, 0, 8);
        if ($magic !== "\x89PNG\r\n\x1a\n") {
            $this->bail($fail, 'La signature n\'est pas un PNG valide.');
        }
    }

    /**
     * @param  \Closure(string): PotentiallyTranslatedString  $fail
     */
    private function bail(\Closure $fail, string $message): void
    {
        $fail($message);
    }
}
