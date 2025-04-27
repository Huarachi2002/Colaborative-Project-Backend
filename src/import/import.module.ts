import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";
import { ImportController } from "./controllers/import.controller";
import { AiProcessingService } from "./services/ai-processing.service";
import { AuthModule } from "../auth/auth.module";
import { UserModule } from "../user/user.module";

@Module({
    imports: [
        ConfigModule,
        MulterModule.register({
            dest: './uploads',
        }),
        forwardRef( () => AuthModule),
        forwardRef( () => UserModule)
    ],
    controllers: [ImportController],
    providers: [AiProcessingService],
})
export class ImportModule {}