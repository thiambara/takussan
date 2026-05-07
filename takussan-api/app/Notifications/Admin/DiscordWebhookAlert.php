<?php

namespace App\Notifications\Admin;

class DiscordWebhookAlert
{
    public static function payload(array $alert): array
    {
        return [
            'content' => $alert['message']."\n".$alert['audit_url'],
        ];
    }
}
