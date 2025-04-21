import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './services';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UserController } from './controllers';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  providers: [UserService],
  imports: [
    PrismaModule,
    forwardRef( () => AuthModule)
  ],
  exports: [
    UserService
  ],
  controllers: [UserController]
})
export class UserModule {}
