import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'payment-details-page',
  standalone: true,
  templateUrl: './paymentDetailsPage.html',
  styleUrls: ['./paymentDetailsPage.css'],
  imports: [CommonModule, FormsModule, RouterLink]
})
export class PaymentDetailsPage {
  private readonly auth = inject(AuthService);
  protected readonly session = this.auth.session;

  cardName = '';
  cardNumber = '';
  cardExpiry = '';
  cardCvc = '';
  billingAddress = '';
  billingCity = '';
  billingZip = '';
  billingState = '';
  cardType = 'visa';

  get maskedCardNumber(): string {
    const maxLength = this.cardType === 'amex' ? 15 : 16;
    const digits = this.cardNumber.replace(/\D/g, '').slice(0, maxLength).padEnd(maxLength, '•');
    return this.cardType === 'amex'
      ? digits.replace(/(\d{4})(\d{6})(\d{5})/, '$1 $2 $3')
      : digits.replace(/(.{4})/g, '$1 ').trim();
  }

  get displayExpiry(): string {
    return this.cardExpiry || 'MM/YY';
  }

  get displayName(): string {
    return this.cardName || 'CARDHOLDER NAME';
  }

  readonly cardTypes = [
    { label: 'Visa', value: 'visa', mask: /^(4)(\d{0,15})$/, logo: 'visa.png' },
    { label: 'Mastercard', value: 'mastercard', mask: /^(5[1-5]|2[2-7])(\d{0,14})$/, logo: 'mastercard.png' },
    { label: 'American Express', value: 'amex', mask: /^(3[47])(\d{0,13})$/, logo: 'amex.png' }
  ];

  get cardLogo(): string {
    const current = this.cardTypes.find((type) => type.value === this.cardType);
    return current ? `/images/${current.logo}` : '/images/visa.png';
  }

  readonly states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ];

  get isAdmin(): boolean {
    const role = this.session()?.user?.role;
    return role?.toLowerCase() === 'admin';
  }
}
