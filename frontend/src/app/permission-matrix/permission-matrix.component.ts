import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { IngamePermission, INGAME_PERMISSIONS, DEFAULT_ROLE_GRANTS } from './permission-matrix.data';

export interface Role {
  id: string;
  name: string;
  count: number;
}

@Component({
  standalone: true,
  selector: 'app-permission-matrix',
  imports: [CommonModule, FormsModule],
  templateUrl: './permission-matrix.component.html',
  styleUrls: ['./permission-matrix.component.css'],
})
export class PermissionMatrixComponent implements OnInit {
  roles: Role[] = [
    { id: 'test_supporter', name: 'Test Supporter', count: 0 },
    { id: 'supporter', name: 'Supporter', count: 0 },
    { id: 'test_moderator', name: 'Test Moderator', count: 0 },
    { id: 'moderator', name: 'Moderator', count: 0 },
    { id: 'teamleitung', name: 'Teamleitung', count: 0 },
    { id: 'entwicklungsleitung', name: 'Entwicklungsleitung', count: 0 },
    { id: 'owner', name: 'Owner', count: 0 },
  ];

  permissions: IngamePermission[] = INGAME_PERMISSIONS;
  roleGrants: Record<string, string[]> = DEFAULT_ROLE_GRANTS;

  assignments: Record<string, Record<string, boolean>> = {};
  categories: string[] = [];

  searchText = '';
  selectedCategory = 'all';
  activePermCode: string | null = null;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.roleGrants['owner'] = this.permissions.map((p) => p.code);

    this.permissions.forEach((p) => {
      this.assignments[p.code] = {};
      this.roles.forEach((r) => {
        this.assignments[p.code][r.id] = (this.roleGrants[r.id] || []).includes(p.code);
      });
    });

    this.categories = Array.from(new Set(this.permissions.map((p) => p.category)));

    this.roles.forEach((role) => {
      role.count = this.permissions.filter((p) => this.assignments[p.code][role.id]).length;
    });
  }

  get visiblePermissions(): IngamePermission[] {
    let list = [...this.permissions];

    if (this.selectedCategory !== 'all') {
      list = list.filter((p) => p.category === this.selectedCategory);
    }

    if (this.searchText.trim() !== '') {
      const q = this.searchText.trim().toLowerCase();
      list = list.filter((p) => {
        return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
      });
    }

    // Always sorted alphabetically by permission name
    list.sort((a, b) => a.name.localeCompare(b.name));

    return list;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  highlightMatch(text: string): SafeHtml {
    const q = this.searchText.trim();
    if (q === '') {
      return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(text));
    }
    const escapedText = this.escapeHtml(text);
    const escapedQuery = this.escapeHtml(q);
    const idx = escapedText.toLowerCase().indexOf(escapedQuery.toLowerCase());
    if (idx === -1) {
      return this.sanitizer.bypassSecurityTrustHtml(escapedText);
    }
    const regex = new RegExp(`(${this.escapeRegExp(escapedQuery)})`, 'gi');
    const highlighted = escapedText.replace(regex, '<mark class="highlight">$1</mark>');
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  togglePermission(permCode: string) {
    this.activePermCode = this.activePermCode === permCode ? null : permCode;
  }

  resetFilters() {
    this.searchText = '';
    this.selectedCategory = 'all';
    this.activePermCode = null;
  }

  isCellActive(permCode: string, roleId: string): boolean {
    if (this.activePermCode === permCode) {
      return !!this.assignments[permCode]?.[roleId];
    }
    return false;
  }

  get isFilterActive(): boolean {
    return this.searchText.trim() !== '' || this.selectedCategory !== 'all' || this.activePermCode !== null;
  }

  async exportTable(format: 'png' | 'svg') {
    const tableEl = document.querySelector('.matrix-table') as HTMLElement;
    if (!tableEl) return;

    // Create an invisible wrapper container that stays inside the viewport layout bounds
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = '0';
    wrapper.style.height = '0';
    wrapper.style.overflow = 'hidden';
    wrapper.style.zIndex = '-9999';
    wrapper.style.pointerEvents = 'none';

    // Create a dummy host element so Angular scoped CSS styles match perfectly
    const hostEl = document.createElement('app-permission-matrix');
    const actualHost = document.querySelector('app-permission-matrix');
    if (actualHost) {
      Array.from(actualHost.attributes).forEach((attr) => {
        hostEl.setAttribute(attr.name, attr.value);
      });
    }

    // Clone table to render in full size, free of scrolling container constraints
    const clone = tableEl.cloneNode(true) as HTMLElement;
    clone.style.position = 'relative';
    clone.style.width = 'max-content'; // Allow natural auto-layout width calculation
    clone.style.minWidth = 'auto';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.display = 'table';

    // Enforce theme background styles for the capture
    const isDark =
      document.documentElement.classList.contains('my-app-dark') || document.body.classList.contains('my-app-dark');
    clone.style.background = isDark ? '#18181b' : '#ffffff';
    clone.style.color = isDark ? '#f3f4f6' : '#1f2937';

    // Strip sticky layout so cells render inline on the canvas/SVG grid
    const stickyCells = clone.querySelectorAll('.sticky-col');
    stickyCells.forEach((cell: any) => {
      cell.style.position = 'static';
      cell.style.boxShadow = 'none';
      cell.style.background = 'transparent';
    });

    const headers = clone.querySelectorAll('thead th');
    headers.forEach((h: any) => {
      h.style.position = 'static';
      h.style.background = isDark ? '#18181b' : '#f1f5f9';
      h.style.color = isDark ? '#f3f4f6' : '#1f2937';
    });

    hostEl.appendChild(clone);
    wrapper.appendChild(hostEl);
    document.body.appendChild(wrapper);

    // Read the exact computed dimensions and apply a safe 12px margin padding box
    const width = clone.offsetWidth + 12;
    const height = clone.offsetHeight + 12;
    clone.style.margin = '6px'; // Shift clone to center it inside the padded boundary box

    try {
      const { toPng, toSvg } = await import('html-to-image');

      if (format === 'png') {
        const dataUrl = await toPng(clone, {
          cacheBust: true,
          backgroundColor: isDark ? '#18181b' : '#ffffff',
          skipFonts: true,
          width: width,
          height: height,
        });
        this.triggerDownload(dataUrl, 'rechte-matrix.png');
      } else if (format === 'svg') {
        const dataUrl = await toSvg(clone, {
          cacheBust: true,
          backgroundColor: isDark ? '#18181b' : '#ffffff',
          skipFonts: true,
          width: width,
          height: height,
        });
        this.triggerDownload(dataUrl, 'rechte-matrix.svg');
      }
    } catch (error) {
      console.error('Fehler beim Exportieren der Tabelle:', error);
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  private triggerDownload(dataUrl: string, filename: string) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
}
