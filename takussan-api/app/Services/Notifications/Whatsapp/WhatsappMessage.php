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

    /** TCK-2981 (ADR-0132 § 3) — un message interactif à boutons de réponse (`button_reply`). */
    public const TYPE_INTERACTIVE = 'interactive';

    private function __construct(
        public readonly string $type,
        public readonly ?string $text,
        public readonly ?WhatsappTemplateRef $template,
        /**
         * TCK-2981 — les boutons de réponse d'un message interactif (`[{id, title}]`, trois au plus), ou la charge
         * utile du bouton `quick_reply` d'un gabarit (`[{id}]`, un seul).
         *
         * @var list<array{id: string, title?: string}>
         */
        public readonly array $buttons = [],
    ) {}

    /**
     * TCK-2981 — un texte à boutons de réponse ; la réponse revient au webhook en `interactive.button_reply`, avec
     * l'`id` du bouton.
     *
     * @param  list<array{id: string, title: string}>  $buttons
     */
    public static function interactive(string $body, array $buttons): self
    {
        return new self(self::TYPE_INTERACTIVE, $body, null, array_slice($buttons, 0, 3));
    }

    /** TCK-2981 — un gabarit dont le bouton `quick_reply` porte cette charge utile (revient en `button.payload`). */
    public static function templateWithQuickReply(WhatsappTemplateRef $ref, string $payload): self
    {
        return new self(self::TYPE_TEMPLATE, null, $ref, [['id' => $payload]]);
    }

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
