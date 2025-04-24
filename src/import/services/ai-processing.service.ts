import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';

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
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Analiza esta imagen de boceto y detecta los elementos para convertirlos en objetos Fabric.js. Crea un JSON con un array 'elements' que contenga todos los objetos detectados. 
                  
                                Cada objeto debe seguir exactamente este formato según su tipo:
                                
                                1. RECTÁNGULO:
                                {
                                    "type": "rectangle",
                                    "left": [posición X],
                                    "top": [posición Y],
                                    "width": [ancho],
                                    "height": [alto],
                                    "fill": "#aabbcc",
                                    "objectId": "[id único]"
                                }
                                
                                2. CÍRCULO:
                                {
                                    "type": "circle",
                                    "left": [posición X],
                                    "top": [posición Y],
                                    "radius": [radio],
                                    "fill": "#aabbcc",
                                    "objectId": "[id único]"
                                }
                                
                                3. TRIÁNGULO:
                                {
                                    "type": "triangle",
                                    "left": [posición X],
                                    "top": [posición Y],
                                    "width": [ancho],
                                    "height": [alto],
                                    "fill": "#aabbcc",
                                    "objectId": "[id único]"
                                }
                                
                                4. LÍNEA:
                                {
                                    "type": "line",
                                    "points": [[x1], [y1], [x2], [y2]],
                                    "stroke": "#aabbcc",
                                    "strokeWidth": 2,
                                    "objectId": "[id único]"
                                }
                                
                                5. TEXTO:
                                {
                                    "type": "text",
                                    "left": [posición X],
                                    "top": [posición Y],
                                    "text": [texto detectado],
                                    "fill": "#aabbcc",
                                    "fontFamily": "Helvetica",
                                    "fontSize": 36,
                                    "fontWeight": "400",
                                    "objectId": "[id único]"
                                }
                                
                                Devuelve solo el JSON válido, sin texto adicional.`
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

}