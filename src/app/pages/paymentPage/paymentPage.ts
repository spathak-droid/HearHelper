import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'payment-page',
  standalone: true,
  templateUrl: './paymentPage.html',
  styleUrls: ['./paymentPage.css'],
  imports: [CommonModule, RouterLink]
})
export class PaymentPage {
  private readonly auth = inject(AuthService);
  protected readonly session = this.auth.session;

  readonly plans = [
    {
      name: 'Free Voices',
      price: '$0',
      description: 'Amy and Arctic are ready to chat right away.',
      perks: ['Unlimited listens with Amy', 'Unlimited listens with Arctic', 'Basic support'],
      highlight: false
    },
    {
      name: 'Lifetime Pass',
      price: '$20 one-time',
      description: 'Pay once, keep every premium voice forever.',
      perks: ['Access to every premium model', 'Future drops included', 'No subscription fees'],
      highlight: true
    }
  ];

  get isAdmin(): boolean {
    const role = this.session()?.user?.role;
    return role?.toLowerCase() === 'admin';
  }

  get lifetimeCtaLabel(): string {
    return this.isAdmin ? 'All premium voices unlocked' : 'Unlock voices';
  }

  get lifetimeCtaDisabled(): boolean {
    return this.isAdmin;
  }
}
