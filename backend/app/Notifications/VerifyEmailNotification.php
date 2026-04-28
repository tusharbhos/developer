<?php
// app/Notifications/VerifyEmailNotification.php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

class VerifyEmailNotification extends Notification
{
    use Queueable;

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $verificationUrl = $this->verificationUrl($notifiable);

        return (new MailMessage)
            ->subject('Verify Your Email – ChannelPartner.Network')
            ->greeting("Hello {$notifiable->name}!")
            ->line('Welcome to ChannelPartner.Network — India\'s #1 Channel Partner Platform.')
            ->line('Please click the button below to verify your email address and activate your account.')
            ->action('Verify Email Address', $verificationUrl)
            ->line('This link will expire in 60 minutes.')
            ->line('If you did not create an account, no further action is required.')
            ->salutation('— Team ChannelPartner.Network');
    }

    protected function verificationUrl(object $notifiable): string
    {
        $signedApiUrl = URL::temporarySignedRoute(
            'verification.verify',
            Carbon::now()->addMinutes(Config::get('auth.verification.expire', 60)),
            [
                'id'   => $notifiable->getKey(),
                'hash' => sha1($notifiable->getEmailForVerification()),
            ]
        );

        $parts = parse_url($signedApiUrl);
        $query = [];
        parse_str($parts['query'] ?? '', $query);

        $path = $parts['path'] ?? '';
        if (!preg_match('#/email/verify/(\d+)/([^/?]+)$#', $path, $matches)) {
            return $signedApiUrl;
        }

        $id = $matches[1];
        $hash = $matches[2];

        $frontendBase = rtrim((string) env('FRONTEND_URL', ''), '/');
        if ($frontendBase === '') {
            return $signedApiUrl;
        }

        $appUrl = rtrim((string) config('app.url'), '/');
        $apiBase = Str::endsWith($appUrl, '/api') ? $appUrl : $appUrl . '/api';

        $frontendQuery = http_build_query([
            'id' => $id,
            'hash' => $hash,
            'expires' => $query['expires'] ?? null,
            'signature' => $query['signature'] ?? null,
            'api_base' => $apiBase,
        ]);

        return $frontendBase . '/verify-email?' . $frontendQuery;
    }
}
