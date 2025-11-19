import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, SignUpPayload } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'sign-up-page',
  standalone: true,
  templateUrl: './signUpPage.html',
  styleUrls: ['./signUpPage.css'],
  imports: [CommonModule, RouterLink, FormsModule]
})
export class SignUpPage {
  formData = {
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  };

  showPassword = false;
  readonly emailPattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
  readonly passwordPattern = '^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$';
  isSubmitting = false;
  submitError = '';
  submitSuccess = '';
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  async onSignUp() {
    if (this.isSubmitting) {
      return;
    }
    this.submitError = '';
    this.submitSuccess = '';
    this.isSubmitting = true;
    const payload: SignUpPayload = {
      first_name: this.formData.firstName.trim(),
      last_name: this.formData.lastName.trim(),
      email: this.formData.email.trim(),
      password: this.formData.password
    };
    try {
      const response = await firstValueFrom(this.authService.signUp(payload));
      this.submitSuccess = response.message || 'Account created! Please verify your email.';
      await this.router
        .navigate(['/verify-email'], { state: { email: payload.email } })
        .catch((error) => console.error('Navigation failed', error));
    } catch (error) {
      console.error('Sign up failed', error);
      this.submitError = this.extractErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  private extractErrorMessage(error: unknown): string {
    if (!error) {
      return 'Unable to create your account. Please try again.';
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
    return 'Unable to create your account. Please try again.';
  }
}
