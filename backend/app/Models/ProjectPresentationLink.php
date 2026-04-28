<?php
// app/Models/ProjectPresentationLink.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectPresentationLink extends Model
{
    use HasFactory;

    protected $fillable = [
        'created_by',
        'developer_name',
        'project_name',
        'presentation_id',
        'with_developer_link',
        'without_developer_link',
        'seven_slide_link',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
