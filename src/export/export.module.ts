import { Module } from '@nestjs/common';
import { ExportService } from './services/export.service';
import { ExportController } from './controller/export.controller';
import { AiProcessingService } from 'src/import/services/ai-processing.service';

@Module({
  imports: [],
  controllers: [ExportController],
  providers: [ExportService, AiProcessingService],
})
export class ExportModule {}