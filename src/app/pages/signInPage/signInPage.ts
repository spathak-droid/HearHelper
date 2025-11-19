import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoogleAuthService, GoogleProfile } from '../../services/google-auth.service';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'sign-in-page',
  standalone: true,
  templateUrl: './signInPage.html',
  styleUrls: ['./signInPage.css'],
  imports: [CommonModule, RouterLink, FormsModule]
})
export class SignInPage {
  credentials = {
    email: '',
    password: ''
  };
  private readonly sessionKey = 'hearhelper-user';
  googleProfile?: GoogleProfile;
  googleError = '';
  isGoogleLoading = false;
  showPassword = false;
  isManualLoading = false;
  manualError = '';
  manualSuccess = '';
  readonly emailPattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
  readonly passwordPattern = '^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$';
  private readonly googleAuth = inject(GoogleAuthService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly session = this.authService.session;

  async onGoogleSignIn() {
    this.googleError = '';
    this.isGoogleLoading = true;
    try {
      const profile = await this.googleAuth.signIn();
      if (!profile) {
        this.googleError = 'Google sign in was cancelled.';
        return;
      }
      this.googleProfile = profile;
      sessionStorage.setItem(this.sessionKey, JSON.stringify(profile));
    } catch (err) {
      console.error(err);
      this.googleError = 'Failed to sign in with Google. Please try again.';
    } finally {
      this.isGoogleLoading = false;
    }
  }

  async onManualSignIn() {
    if (!this.credentials.email || !this.credentials.password) {
      this.manualError = 'Enter your email and password to continue.';
      return;
    }
    this.manualError = '';
    this.manualSuccess = '';
    this.isManualLoading = true;
    try {
      const response = await firstValueFrom(
        this.authService.signIn({
          email: this.credentials.email,
          password: this.credentials.password
        })
      );
      this.manualSuccess = response.message || 'Signin successful.';
      await this.router.navigateByUrl('/');
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Manual sign in failed', err);
      this.manualError = this.extractErrorMessage(err);
      this.cdr.detectChanges();
    } finally {
      this.isManualLoading = false;
      this.cdr.detectChanges();
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  private extractErrorMessage(error: unknown) {
    if (!error) {
      return 'Unable to sign in. Please try again.';
    }

    if (typeof error === 'string') {
      return error;
    }

    const httpError = error as { error?: unknown; message?: string; statusText?: string };

    if (httpError.error) {
      if (typeof httpError.error === 'string') {
        return httpError.error;
      }
      if (typeof httpError.error === 'object' && httpError.error) {
        const { error: nestedError, message, detail } = httpError.error as {
          error?: string;
          message?: string;
          detail?: string;
        };
        if (nestedError) {
          return nestedError;
        }
        if (message) {
          return message;
        }
        if (detail) {
          return detail;
        }
      }
    }

    if (httpError.message) {
      return httpError.message;
    }

    if (httpError.statusText) {
      return httpError.statusText;
    }

    return 'Unable to sign in. Please try again.';
  }
}
