import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthTokenGuard } from "src/auth/guard";
import { IApiResponse } from "src/common/interface";
import { Request } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AiProcessingService } from "../services/ai-processing.service";


@Controller("import")
@UseGuards(AuthTokenGuard)
export class ImportController {
    constructor(private readonly aiProcessingService: AiProcessingService) {}

    @Post("sketch")
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(
        FileInterceptor('sketch', {
          storage: diskStorage({
            destination: './uploads/sketches',
            filename: (req, file, callback) => {
              const uniqueSuffix = uuidv4();
              const ext = extname(file.originalname);
              callback(null, `sketch-${uniqueSuffix}${ext}`);
            },
          }),
          fileFilter: (req, file, callback) => {
            if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
              return callback(
                new BadRequestException('Solo se permiten archivos de imagen'),
                false,
              );
            }
            callback(null, true);
          },
          limits: {
            fileSize: 5 * 1024 * 1024, // 5MB
          },
        }),
      )
      async processSketch(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: Request,
      ): Promise<IApiResponse<any>>{
        if(!file) {
          throw new BadRequestException('No se ha subido ningún archivo');
        }
        const statusCode = HttpStatus.OK;

        try {
          // Leer la imagen del archivo
          const fs = require('fs');
          const imageBuffer = fs.readFileSync(file.path);
          
          // Procesar la imagen con IA
          const result = await this.aiProcessingService.processSketch(imageBuffer);

          fs.unlink(file.path, (err) => {
            if (err) console.error('Error al eliminar archivo temporal:', err);
          });
          
          return {
              statusCode,
              message: 'Archivo subido y procesado correctamente',
              data: {
                elements: result.elements
              }
          }
        } catch (error) {
          throw new BadRequestException('Error al procesar el boceto: ' + error.message);
        }

      }

      
}