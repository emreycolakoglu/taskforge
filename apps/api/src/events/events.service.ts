import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

@Injectable()
export class EventsService {
  private eventSubject = new Subject<{ event: string; data: any }>();

  emit(event: string, data: any) {
    this.eventSubject.next({ event, data });
  }

  observe(): Observable<{ event: string; data: any }> {
    return this.eventSubject.asObservable();
  }
}
