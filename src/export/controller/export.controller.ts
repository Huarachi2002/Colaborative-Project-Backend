import { BadRequestException, Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { ExportService } from "../services/export.service";
import { CreateAngularDto } from "../dto/create-angular.dto";
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Controller("export")
export class ExportController {
    constructor(private readonly exportService: ExportService) {}

    @Post("angular")
    public async exportAngular(
        @Body() createAngularDto: CreateAngularDto,
        @Res() res: Response
    ): Promise<void>{
        try {
            // Generar el buffer del ZIP
            const zipBuffer = await this.exportService.generateAngularProject(createAngularDto);
            
            // Generar un nombre de archivo seguro
            const safeFileName = createAngularDto.projectName
                .replace(/\s+/g, '-')
                .replace(/[^a-zA-Z0-9-_]/g, '')
                .toLowerCase();
                
            // Crear directorio temporal si no existe
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            // Guardar archivo ZIP en disco temporalmente
            const uniqueId = uuidv4();
            const tempFilePath = path.join(tempDir, `${safeFileName}-${uniqueId}.zip`);
            fs.writeFileSync(tempFilePath, zipBuffer);
            
            // Configurar encabezados para la respuesta
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}.zip"`);
            res.setHeader('Content-Length', fs.statSync(tempFilePath).size);
            res.setHeader('Cache-Control', 'no-cache');
            
            // Enviar el archivo al cliente usando un stream
            const fileStream = fs.createReadStream(tempFilePath);
            fileStream.pipe(res);
            
            // Eliminar archivo temporal después de enviarlo
            fileStream.on('end', () => {
                fs.unlinkSync(tempFilePath);
            });
            
            fileStream.on('error', (err) => {
                console.error('Error durante el streaming del archivo:', err);
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            });
        } catch (error) {
            console.error("Error generating Angular project:", error);
            throw new BadRequestException("Failed to generate Angular project: " + error.message);
        }
    }
}