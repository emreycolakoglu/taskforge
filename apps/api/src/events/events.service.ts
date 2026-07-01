import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface EventPayload {
  event: string;
  data: any;
  boardId?: string;
  userRoom?: string;
}

@Injectable()
export class EventsService {
  private eventSubject = new Subject<EventPayload>();

  emit(event: string, data: any, boardId?: string, opts?: { userRoom?: string }) {
    this.eventSubject.next({ event, data, boardId, userRoom: opts?.userRoom });
  }

  observe(): Observable<EventPayload> {
    return this.eventSubject.asObservable();
  }
}