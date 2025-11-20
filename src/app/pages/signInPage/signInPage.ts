import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, OAuthLoginUrlResponse } from '../../services/auth.service';
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
  googleError = '';
  googleStatus = '';
  isGoogleLoading = false;
  showPassword = false;
  isManualLoading = false;
  manualError = '';
  manualSuccess = '';
  readonly emailPattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
  readonly passwordPattern = '^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$';
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly session = this.authService.session;

  async onGoogleSignIn() {
    this.googleError = '';
    this.googleStatus = '';
    this.isGoogleLoading = true;
    try {
      const redirectUri = this.resolveOAuthRedirectUri();
      const response = await firstValueFrom(this.authService.requestOAuthLoginUrl(redirectUri));
      const loginUrl = this.resolveAuthorizeUrl(response);
      if (!loginUrl) {
        this.googleError = 'Unable to start Google sign in. Please try again.';
        return;
      }
      this.googleStatus = 'Redirecting you to Google...';
      window.location.href = loginUrl;
    } catch (err) {
      console.error('Failed to start Google OAuth login', err);
      this.googleError = this.extractErrorMessage(err);
    } finally {
      this.isGoogleLoading = false;
      this.cdr.detectChanges();
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

  private resolveOAuthRedirectUri(): string {
    if (typeof window === 'undefined') {
      return 'http://localhost:4200/oauth/callback';
    }
    const targetTree = this.router.createUrlTree(['/oauth/callback']);
    const serialized = this.router.serializeUrl(targetTree);
    return new URL(serialized, window.location.origin).toString();
  }

  private resolveAuthorizeUrl(response: OAuthLoginUrlResponse): string | undefined {
    const value = response?.authorize_url || response?.login_url;
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
}
