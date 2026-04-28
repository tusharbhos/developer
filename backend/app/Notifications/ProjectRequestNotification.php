<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ProjectRequestNotification extends Notification
{
    use Queueable;

    protected $data;

    public function __construct(array $data)
    {
        $this->data = $data;
    }

    public function via($notifiable)
    {
        return ['mail'];
    }

    public function toMail($notifiable)
    {
        $message = "Hello {$this->data['source_manager_name']},\n\n";
        $message .= "I recently saw a network design for Channel Partner that allows us to see your presence in an appreciative way. ";
        $message .= "I would like to activate your {$this->data['project_name']} ({$this->data['developer_name']}) on this network so that it helps me to sell.\n\n";
        $message .= "I have shared your phone number with the network team. They shall contact you for us.\n\n";
        $message .= "You can call them at +91 9767176377\n\n";
        $message .= "Regards,\n{$this->data['channel_partner_name']}\n";
        $message .= "Channel Partner";

        return (new MailMessage)
            ->subject("Project Activation Request: {$this->data['project_name']} from {$this->data['channel_partner_name']}")
            ->greeting("Hello {$this->data['source_manager_name']}!")
            ->line($message)
            ->line('Thank you for your interest in partnering with us.')
            ->salutation('— ChannelPartner Network Team');
    }
}