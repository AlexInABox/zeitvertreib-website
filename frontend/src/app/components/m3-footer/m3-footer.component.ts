import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The shared m3 footer: Bewerben, Discord and the legal links. */
@Component({
  selector: 'app-m3-footer',
  template: `
    <footer class="m3-footer">
      <div class="m3-footer-inner">
        <span class="m3-footer-brand">© {{ year }} Zeitvertreib</span>
        <div class="m3-footer-links">
          <a href="/bewerben">Bewerben</a>
          <a href="https://dsc.gg/zeit" target="_blank" rel="noopener">Discord</a>
          <a href="/imprint.txt">Impressum</a>
          <a href="/privacy-policy.txt">Datenschutz</a>
        </div>
      </div>
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class M3FooterComponent {
  readonly year = new Date().getFullYear();
}
