import { Routes } from '@angular/router';
import { MainPage } from './pages/mainPage/mainPage';
import { HelpPage } from './pages/helpPage/helpPage';
import { SignInPage } from './pages/signInPage/signInPage';

export const routes: Routes = [
    { path: "", component: MainPage},
    { path: "help", component: HelpPage},
    { path: "signin", component: SignInPage}
];
