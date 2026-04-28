<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activation_request_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('activation_request_id')->constrained('activation_requests')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['activation_request_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activation_request_approvals');
    }
};
