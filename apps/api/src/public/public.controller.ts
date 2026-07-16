import { Controller, Get, Param } from '@nestjs/common';
import { PublicService } from './public.service';
import { Public } from '../auth/public.decorator';

/**
 * The app's only unauthenticated read surface.
 *
 * `@Public()` opts this route out of the global APP_GUARD (see auth.module.ts).
 * There is deliberately no POST/PUT/DELETE here: public visitors cannot edit
 * because no unauthenticated write path exists, not because a flag says no.
 * Keep it that way.
 */
@Controller('api/public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Public()
  @Get('tasks/:identifier/:number')
  findPublicTask(
    @Param('identifier') identifier: string,
    @Param('number') number: string,
  ) {
    return this.service.findPublicTask(identifier.toUpperCase(), parseInt(number, 10));
  }
}
