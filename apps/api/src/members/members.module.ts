import { Module } from '@nestjs/common';
import { MembersController, BoardJoinController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  controllers: [MembersController, BoardJoinController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
