import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthTokenGuard } from "src/auth/guard";
import { IApiResponse } from "src/common/interface";
import { Request } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';


@Controller("import")
@UseGuards(AuthTokenGuard)
export class ImportController {
    constructor(private readonly importService: ImportService) {}

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
      async importSketch(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: Request,
      ): Promise<IApiResponse<any>>{
        if(!file) {
          throw new BadRequestException('No se ha subido ningún archivo');
        }
        const statusCode = HttpStatus.OK;
        const userId = req.UserId;
        const importId = await this.importService.processSketch(file, userId);
        return {
            statusCode,
            message: 'Archivo subido y procesado correctamente',
            data: {importId}
        }

      }

      @Get('result/:id')
      async getImportResult(@Param('id') importId: string) {
        const result = await this.importService.getImportResult(importId);
        return result;
      }
}