import { Routes } from '@angular/router';
import { MainPage } from './pages/mainPage/mainPage';
import { HelpPage } from './pages/helpPage/helpPage';
import { SignInPage } from './pages/signInPage/signInPage';
import { SignUpPage } from './pages/signUpPage/signUpPage';
import { PaymentPage } from './pages/paymentPage/paymentPage';
import { PaymentDetailsPage } from './pages/paymentDetailsPage/paymentDetailsPage';
import { VerifyEmailPage } from './pages/verifyEmailPage/verifyEmailPage';
import { GenerateAudioPage } from './pages/generateAudioPage/generateAudioPage';
import { OAuthCallbackPage } from './pages/oauthCallbackPage/oauthCallbackPage';

export const routes: Routes = [
    { path: "", component: MainPage},
    { path: "help", component: HelpPage},
    { path: "signin", component: SignInPage},
    { path: "signup", component: SignUpPage},
    { path: "verify-email", component: VerifyEmailPage},
    { path: "generate-audio", component: GenerateAudioPage},
    { path: "payment", component: PaymentPage},
    { path: "payment/details", component: PaymentDetailsPage},
    { path: "oauth/callback", component: OAuthCallbackPage}
];
