<?php

namespace App\Notifications\Admin;

class EmailAlert
{
    public static function payload(array $alert): array
    {
        return [
            'subject' => $alert['title'],
            'body' => $alert['message'],
            'audit_url' => $alert['audit_url'],
        ];
    }
}
