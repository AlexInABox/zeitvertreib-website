import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EasterEggService {
    /** Observable that emits when chiikawa easter egg should be triggered */
    chiikawaTrigger$ = new Subject<void>();

    triggerChiikawa(): void {
        this.chiikawaTrigger$.next();
    }
}
