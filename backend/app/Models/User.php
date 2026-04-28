<?php
// app/Models/User.php

namespace App\Models;

use App\Notifications\VerifyEmailNotification;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'company_id',
        'name',
        'email',
        'password',
        'company_name',
        'company_size',
        'profile_image',
        'rera_no',
        'phone',
        'city',
        'address',
        'role',
        'is_company_owner',
        'is_active',
        'experience_level',
        'primary_market',
        'budget_segments',
        'max_ticket_size',
        'buyer_types',
        'project_preference',
        'micro_markets',
        'sell_cities',
        'avg_leads_per_month',
        'avg_site_visits_per_month',
        'avg_closures_per_month',
        'selling_style',
        'activation_intent',
        'commitment_signal',
        'onboarding_step',
        'email_verified_at',
        'developer_name',
        'gst_no',
        'unique_key',
        'assigned_projects',
        'parent_user_id',
        'is_restore_hidden',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'is_active' => 'boolean',
        'is_company_owner' => 'boolean',
        'primary_market' => 'array',
        'budget_segments' => 'array',
        'buyer_types' => 'array',
        'project_preference' => 'array',
        'selling_style' => 'array',
        'commitment_signal' => 'boolean',
        'max_ticket_size' => 'decimal:2',
        'avg_leads_per_month' => 'integer',
        'avg_site_visits_per_month' => 'integer',
        'avg_closures_per_month' => 'integer',
        'onboarding_step' => 'integer',
        'assigned_projects' => 'array',
        'parent_user_id' => 'integer',
        'is_restore_hidden' => 'boolean',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function deletedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    // ── Helpers ──────────────────────────────────────────
    // Use our branded email verification
    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerifyEmailNotification());
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isVerified(): bool
    {
        return $this->email_verified_at !== null;
    }
}
