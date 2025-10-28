import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NoSteamLinkComponent } from './no-steam-link.component';

describe('NoSteamLinkComponent', () => {
  let component: NoSteamLinkComponent;
  let fixture: ComponentFixture<NoSteamLinkComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoSteamLinkComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NoSteamLinkComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should navigate to login when goToLogin is called', () => {
    spyOn(router, 'navigate');
    component.goToLogin();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should navigate to home when goHome is called', () => {
    spyOn(router, 'navigate');
    component.goHome();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
