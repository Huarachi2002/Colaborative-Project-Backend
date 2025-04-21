import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './services';
import { AuthController } from './controller/auth.controller';
import { UserModule } from 'src/user/user.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { RoomModule } from 'src/room/room.module';

@Module({
  providers: [AuthService],
  controllers: [AuthController],
  imports: [
    forwardRef( () => UserModule),
    PrismaModule,
    JwtModule,
    forwardRef( () => RoomModule)
  ],
  exports: [
    AuthService
  ]
})
export class AuthModule {}
