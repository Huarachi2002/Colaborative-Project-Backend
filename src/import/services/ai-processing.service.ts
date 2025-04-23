import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { createCanvas } from 'canvas';

interface Element {
    type: string;
    x: number;
    y: number;
    [key: string]: any;
}

@Injectable()
export class AiProcessingService {
    private openaiApiKey: string;

    constructor(private configService: ConfigService) {
        this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    }

    async processSketch(imageBuffer: Buffer): Promise<{elements: Element[]}> {

        const base64Image = imageBuffer.toString('base64');

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4-vision-preview',
                    message: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: "Analiza esta imagen y detecta los elementos de diseño (rectángulos, círculos, líneas, textos, etc.). Devuelve una respuesta JSON con un array de elementos detectados. Cada elemento debe tener type, x, y, y otras propiedades específicas según el tipo. Por ejemplo, un rectángulo debe tener width y height. Asegúrate que el JSON sea válido y sin explicaciones adicionales."
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/jpeg;base64,${base64Image}`
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens: 4000
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.openaiApiKey}`
                    }
                }
            );

            // Extraer y parsear la respuesta JSON
            const content = response.data.choices[0].message.content;
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/) || [null, content];
            let jsonString = jsonMatch[1] || content;

            // Limpiar el JSON si es necesario
            if(!jsonString.trim().startsWith('{')) {
                jsonString = jsonString.substring(jsonString.indexOf('{'));
            }

            const parsedData = JSON.parse(jsonString);

            // Asegurarse de que hay un array de elementos
            const elements = Array.isArray(parsedData.elements) 
            ? parsedData.elements 
            : (parsedData.shapes || parsedData.objects || []);
            
            return { elements };
        } catch (error) {
            console.error('Error calling OpenAI API:', error.response?.data || error.message);
            throw new Error('Error processing sketch with AI');
        }
    }

    async generatePreview(elements: Element[], outputPath: string): Promise<void>{
        // Crear un canvas para la vista previa

        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');

        // Fondo blanco
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 800, 600);

        // Renderizar elementos
        elements.forEach(element => {
            this.renderElement(ctx, element);
        });

        // Asegurarse de que el directorio existe
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Guardar la imagen
        const buffer = canvas.toBuffer('image/png');
        await fs.writeFile(outputPath, buffer);
    }

    private renderElement(ctx: any, element: Element): void {
        ctx.beginPath();
        ctx.fillStyle = element.strokeColor || '#000000';
        ctx.lineWidth = element.strokeWidth || 2;

        switch (element.type) {
            case 'rectangle':
                ctx.react(element.x, element.y, element.width, element.height);
                break;
            case 'circle':
                ctx.arc(
                    element.x + element.radius,
                    element.y + element.radius,
                    element.radius,
                    0,
                    Math.PI * 2
                );
                break;
            case 'line':
                ctx.moveTo(element.x1 || element.x, element.y1 || element.y);
                ctx.lineTo(element.x2, element.y2);
                break;
            case 'text':
                ctx.font = `${element.fontSize || 16}px sans-serif`;
                ctx.fillStyle = element.color|| '#000';
                ctx.fillText(element.text, element.x, element.y);
                return;
        }

        if(element.fill){
            ctx.fillStyle = element.fillColor || '#fff';
            ctx.fill();
        }

        ctx.stroke();
    }
}