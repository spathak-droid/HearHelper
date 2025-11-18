import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('HearHelper');
  showGlobalMenu = false;
  private readonly auth = inject(AuthService);
  protected readonly session = this.auth.session;
  protected readonly userDisplayName = computed(() => {
    const user = this.session()?.user;
    if (!user) {
      return 'Guest';
    }
    const first = user.first_name?.trim() ?? '';
    const last = user.last_name?.trim() ?? '';
    return `${first} ${last}`.trim();
  });
  onSignOut() {
    this.auth.clearSession();
    this.showGlobalMenu = false;
  }
}
