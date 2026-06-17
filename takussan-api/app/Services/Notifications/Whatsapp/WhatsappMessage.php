<?php

namespace App\Services\Notifications\Whatsapp;

/**
 * TCK-282 — A WhatsApp message to dispatch: either free-form `text` (only
 * valid inside the 24h service window) or a `template` (mandatory outside
 * it). The {@see WhatsappChannel} decides which based on the service window
 * and the notification's available content.
 */
final class WhatsappMessage
{
    public const TYPE_TEXT = 'text';

    public const TYPE_TEMPLATE = 'template';

    private function __construct(
        public readonly string $type,
        public readonly ?string $text,
        public readonly ?WhatsappTemplateRef $template,
    ) {}

    public static function text(string $body): self
    {
        return new self(self::TYPE_TEXT, $body, null);
    }

    public static function template(WhatsappTemplateRef $ref): self
    {
        return new self(self::TYPE_TEMPLATE, null, $ref);
    }

    public function isTemplate(): bool
    {
        return $this->type === self::TYPE_TEMPLATE;
    }
}
