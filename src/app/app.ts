import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { firstValueFrom } from 'rxjs';

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
  private readonly router = inject(Router);
  protected readonly session = this.auth.session;
  private readonly avatarPreview = signal<string | null>(null);
  readonly avatarOffsetX = signal(50);
  readonly avatarOffsetY = signal(50);
  protected readonly avatarUrl = computed(
    () => this.avatarPreview() || this.session()?.user?.profile_photo_url || '/images/blank-avatar.svg'
  );
  protected readonly avatarObjectPosition = computed(
    () => `${this.avatarOffsetX()}% ${this.avatarOffsetY()}%`
  );
  readonly isAvatarUploading = signal(false);
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
    this.router.navigate(['/signin']).catch((error) => {
      console.error('Failed to navigate to sign in after logout', error);
    });
  }

  async onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const extension = this.resolveExtension(file);
    try {
      this.isAvatarUploading.set(true);
      const uploadDetails = await firstValueFrom(this.auth.requestPhotoUpload(extension));
      await fetch(uploadDetails.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': uploadDetails.content_type
        },
        body: file
      });
      this.avatarPreview.set(uploadDetails.download_url);
      this.auth.updateAvatar(uploadDetails.download_url);
    } catch (error) {
      console.error('Failed to upload avatar', error);
    } finally {
      this.isAvatarUploading.set(false);
    }
  }

  onAvatarOffsetChange(axis: 'x' | 'y', value: string) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return;
    }
    if (axis === 'x') {
      this.avatarOffsetX.set(numeric);
    } else {
      this.avatarOffsetY.set(numeric);
    }
  }

  private resolveExtension(file: File): string {
    const fromName = file.name?.split('.').pop()?.toLowerCase();
    if (fromName) {
      return fromName;
    }
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/jpeg') return 'jpg';
    if (file.type === 'image/gif') return 'gif';
    return 'png';
  }

  closeGlobalMenu() {
    this.showGlobalMenu = false;
  }
}
