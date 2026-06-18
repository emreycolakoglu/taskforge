import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface EventPayload {
  event: string;
  data: any;
  boardId?: string;
}

@Injectable()
export class EventsService {
  private eventSubject = new Subject<EventPayload>();

  emit(event: string, data: any, boardId?: string) {
    this.eventSubject.next({ event, data, boardId });
  }

  observe(): Observable<EventPayload> {
    return this.eventSubject.asObservable();
  }
}
