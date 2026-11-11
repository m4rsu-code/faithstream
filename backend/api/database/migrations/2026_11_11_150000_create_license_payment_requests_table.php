<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('license_payment_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('payment_method', 32);
            $table->string('payer_name', 120);
            $table->string('transaction_reference', 100);
            $table->unsignedBigInteger('amount');
            $table->char('currency', 3);
            $table->string('proof_path', 500);
            $table->string('status', 20)->default('pending')->index();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('admin_note', 500)->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status']);
            $table->unique(['payment_method', 'transaction_reference']);
        });

        Schema::create('user_licenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('payment_request_id')->nullable()->unique()->constrained('license_payment_requests')->nullOnDelete();
            $table->string('status', 20)->default('active')->index();
            $table->timestamp('activated_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_licenses');
        Schema::dropIfExists('license_payment_requests');
    }
};
