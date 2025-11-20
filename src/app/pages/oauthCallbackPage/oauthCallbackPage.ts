import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'oauth-callback-page',
  standalone: true,
  templateUrl: './oauthCallbackPage.html',
  styleUrls: ['./oauthCallbackPage.css'],
  imports: [CommonModule]
})
export class OAuthCallbackPage implements OnInit {
  status = 'Completing your sign in...';
  error = '';

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  ngOnInit() {
    void this.finishSignIn();
  }

  private async finishSignIn() {
    const params = this.route.snapshot.queryParamMap;
    const oauthError = params.get('error');
    const oauthErrorDescription = params.get('error_description');

    if (oauthError) {
      this.error = oauthErrorDescription || oauthError;
      this.status = 'Unable to complete sign in.';
      return;
    }

    const code = params.get('code');

    if (!code) {
      this.error = 'Missing authorization code. Please try signing in again.';
      this.status = 'Unable to complete sign in.';
      return;
    }

    try {
      const redirectUri = this.resolveOAuthRedirectUri();
      const response = await firstValueFrom(this.authService.completeOAuthSignIn(code, redirectUri));
      this.status = response.message || 'Signed in successfully.';
      await this.router.navigateByUrl('/');
    } catch (err) {
      console.error('OAuth callback processing failed', err);
      this.error = this.extractErrorMessage(err);
      this.status = 'Unable to complete sign in.';
    }
  }

  private resolveOAuthRedirectUri(): string {
    if (typeof window === 'undefined') {
      return 'http://localhost:4200/oauth/callback';
    }
    const targetTree = this.router.createUrlTree(['/oauth/callback']);
    const serialized = this.router.serializeUrl(targetTree);
    return new URL(serialized, window.location.origin).toString();
  }

  private extractErrorMessage(error: unknown) {
    if (!error) {
      return 'Unable to complete sign in. Please try again.';
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

    return 'Unable to complete sign in. Please try again.';
  }
}
