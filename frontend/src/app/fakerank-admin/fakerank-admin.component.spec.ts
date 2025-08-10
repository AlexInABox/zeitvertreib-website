import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { FakerankAdminComponent } from './fakerank-admin.component';

describe('FakerankAdminComponent', () => {
  let component: FakerankAdminComponent;
  let fixture: ComponentFixture<FakerankAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FakerankAdminComponent],
      providers: [provideHttpClient(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FakerankAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default state', () => {
    expect(component.activeTabIndex()).toBe(0);
    expect(component.toastMessages()).toEqual([]);
    expect(component.showColorPicker()).toBe(false);
    expect(component.searchSteamId()).toBe('');
  });

  it('should compute authentication state correctly', () => {
    expect(component.isAuthenticated()).toBe(false);
    expect(component.isFakerankAdmin()).toBe(false);
  });

  it('should handle tab changes', () => {
    component.onTabChange(1);
    expect(component.activeTabIndex()).toBe(1);
  });

  it('should toggle color picker', () => {
    expect(component.showColorPicker()).toBe(false);
    component.toggleColorPicker();
    expect(component.showColorPicker()).toBe(true);
    component.toggleColorPicker();
    expect(component.showColorPicker()).toBe(false);
  });

  it('should select color and close picker', () => {
    component.showColorPicker.set(true);
    component.selectColor('red');
    expect(component.tempFakerankColor()).toBe('red');
    expect(component.showColorPicker()).toBe(false);
  });

  it('should format dates correctly', () => {
    const testDate = '2023-01-01T12:00:00.000Z';
    const formatted = component.formatDate(testDate);
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('2023');
  });

  it('should handle avatar errors', () => {
    const mockEvent = {
      target: { src: '' },
    };
    component.onAvatarError(mockEvent);
    expect(mockEvent.target.src).toContain('placeholder');
  });
});
