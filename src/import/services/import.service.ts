import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/services";
import { AiProcessingService } from './ai-processing.service';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import * as path from 'path';

interface ImportTask {
    id: string;
    userId: string;
    filePath: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: any;
    error?: string;
}

@Injectable()
export class ImportService {
    private importTasks: Map<string, ImportTask> = new Map();

    constructor(
        private readonly prismaService: PrismaService,
        private readonly aiProcessingService: AiProcessingService,
    ) {}

    async processSketch(file: Express.Multer.File, userId: string): Promise<string> {
        const importId = uuidv4();
        const importTask: ImportTask = {
            id: importId,
            userId,
            filePath: file.path,
            status: 'pending',
        };

        this.importTasks.set(importId, importTask);
        this.processSketchAsync(importTask);

        return importId;
    }

    private async processSketchAsync(importTask: ImportTask): Promise<void> {
        try {
            importTask.status = 'processing';

            this.importTasks.set(importTask.id, importTask);

            const imageBuffer = await fs.readFile(importTask.filePath);

            const result = await this.aiProcessingService.processImage(imageBuffer);

            const previewImagePath = path.join(
                'uploads',
                'previews',
                `preview-${importTask.id}.jpg`,
            );

            await this.aiProcessingService.generatePreview(result.elements, previewImagePath);

            importTask.status = 'completed';
            importTask.result = {
                elements: result.elements,
                preview: `/api/uploads/previews/preview-${importTask.id}.jpg`,
            }

            this.importTasks.set(importTask.id, importTask);

            await this.prismaService.importResult.create({
                data: {
                    id: importTask.id,
                    userId: importTask.userId,
                    filePath: importTask.filePath,
                    resultData: JSON.stringify(result),
                    previewPath: previewImagePath
                }
            });
        } catch (error) {
            console.error('Error processing sketch:', error);

            importTask.status = 'failed';
            importTask.error = error.message;
            this.importTasks.set(importTask.id, importTask);
        }
    }

    async getImportResult(importId: string): Promise<any> {
        // Primero intentar obtener de memoria
        const importTask = this.importTasks.get(importId);
        
        if (importTask) {
          if (importTask.status === 'pending' || importTask.status === 'processing') {
            return { status: importTask.status, progress: importTask.status === 'processing' ? 50 : 10 };
          }
          
          if (importTask.status === 'failed') {
            throw new Error(importTask.error || 'Error procesando el boceto');
          }
          
          return importTask.result;
        }
        
        // Si no está en memoria, buscar en la base de datos
        const savedResult = await this.prismaService.importResult.findUnique({
          where: { id: importId },
        });
        
        if (!savedResult) {
          throw new NotFoundException(`No se encontró el resultado de importación con ID ${importId}`);
        }
        
        return {
          elements: JSON.parse(savedResult.resultData).elements,
          preview: `/api/uploads/previews/${path.basename(savedResult.previewPath)}`,
        };
      }
}