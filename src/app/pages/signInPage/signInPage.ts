import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sign-in-page',
  standalone: true,
  templateUrl: './signInPage.html',
  styleUrls: ['./signInPage.css'],
  imports: [CommonModule, RouterLink]
})
export class SignInPage {
  onGoogleSignIn() {
    console.log('Google sign in started');
  }

  onManualSignIn() {
    console.log('Manual sign in started');
  }
}
