import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The shared JULE footer: Bewerben, Discord and the legal links. */
@Component({
  selector: 'app-jule-footer',
  template: `
    <footer class="jule-footer">
      <div class="jule-footer-inner">
        <span class="jule-footer-brand">© {{ year }} Zeitvertreib</span>
        <div class="jule-footer-links">
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
export class JuleFooterComponent {
  readonly year = new Date().getFullYear();
}
