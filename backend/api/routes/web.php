<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\EmailVerificationController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/reset-password/{token}', [PasswordResetController::class, 'show'])->name('password.reset');
Route::post('/reset-password', [PasswordResetController::class, 'update'])->middleware('throttle:5,1')->name('password.update');
Route::get('/password-reset-success', [PasswordResetController::class, 'success'])->name('password.reset.success');
Route::get('/verify-email/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->middleware(['signed', 'throttle:6,1'])
    ->name('verification.verify');
