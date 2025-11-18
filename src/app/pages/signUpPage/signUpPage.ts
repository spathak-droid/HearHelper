import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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

  onSignUp() {
    console.log('Sign up flow started', this.formData);
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
