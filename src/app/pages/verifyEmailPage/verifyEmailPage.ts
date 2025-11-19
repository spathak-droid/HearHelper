import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'verify-email-page',
  standalone: true,
  templateUrl: './verifyEmailPage.html',
  styleUrls: ['./verifyEmailPage.css'],
  imports: [CommonModule, RouterLink]
})
export class VerifyEmailPage {
  private readonly router = inject(Router);

  private readonly navEmail =
    this.router.getCurrentNavigation()?.extras?.state?.['email'] ??
    (typeof history !== 'undefined' ? (history.state?.email as string | undefined) : undefined);

  readonly email = typeof this.navEmail === 'string' ? this.navEmail : '';
}
