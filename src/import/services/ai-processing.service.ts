import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from 'uuid';
import { promptIABoceto, promptIAComponentsAngular } from "../constants/prompts";
import OpenAI from "openai";

interface Element {
    type: string;
    x: number;
    y: number;
    [key: string]: any;
}

@Injectable()
export class AiProcessingService {
    private openaiApiKey: string;
    private openai: OpenAI;
    private readonly logger = new Logger(AiProcessingService.name);

    constructor(private configService: ConfigService) {
        this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
        
        if (this.openaiApiKey) {
            try {
                this.openai = new OpenAI({
                    apiKey: this.openaiApiKey
                });
                this.logger.log('Servicio de OpenAI inicializado correctamente');
            } catch (error) {
                this.logger.error(`Error al inicializar OpenAI: ${error.message}`);
            }
        } else {
            this.logger.error('No se encontró la clave API de OpenAI. El servicio no funcionará correctamente.');
        }
    }

    async processSketch(imageBuffer: Buffer): Promise<{elements: Element[]}> {
        try {
            const base64Image = imageBuffer.toString('base64');
            
            this.logger.log('Procesando boceto con OpenAI...');
            return await this.processWithOpenAI(base64Image);
        } catch (error) {
            this.logger.error(`Error al procesar con OpenAI: ${error.message}`);
            this.logger.warn('Usando elementos por defecto.');
            return { elements: this.createDefaultElements() };
        }
    }

    private async processWithOpenAI(base64Image: string): Promise<{elements: Element[]}> {
        try {
            if (!this.openai) {
                throw new Error('OpenAI no está inicializado. Verifica tu API key.');
            }
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: promptIABoceto
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 4000,
            });

            const content = response.choices[0].message.content;
            
            // Extraer y parsear la respuesta JSON
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                             content.match(/```([\s\S]*?)```/) || 
                             [null, content];
            
            let jsonString = jsonMatch[1] || content;
            
            // Limpiar el JSON si es necesario
            if(!jsonString.trim().startsWith('{')) {
                const startIndex = jsonString.indexOf('{');
                if (startIndex === -1) {
                    throw new Error('No se pudo encontrar un objeto JSON válido en la respuesta de OpenAI');
                }
                jsonString = jsonString.substring(startIndex);
            }

            const parsedData = JSON.parse(jsonString);
            
            // Asegurarse de que hay un array de elementos
            let elements = [];
            if (Array.isArray(parsedData.elements)) {
                elements = parsedData.elements;
            } else if (Array.isArray(parsedData.shapes)) {
                elements = parsedData.shapes;
            } else if (Array.isArray(parsedData.objects)) {
                elements = parsedData.objects;
            } else if (parsedData.elements === undefined) {
                elements = this.transformToElementsArray(parsedData);
            }
            
            // Verificar si tenemos elementos
            if (elements.length === 0) {
                elements = this.createDefaultElements();
            }

            // Asegurarse de que todos los elementos tienen un objectId y coordenadas x,y
            elements = elements.map(elem => {
                if (!elem.objectId) {
                    elem.objectId = uuidv4();
                }
                // Asegurarse de que cada elemento tiene coordenadas x, y
                if (elem.left !== undefined && elem.x === undefined) {
                    elem.x = elem.left;
                }
                if (elem.top !== undefined && elem.y === undefined) {
                    elem.y = elem.top;
                }
                return elem;
            });
            
            return { elements };
        } catch (error) {
            this.logger.error(`Error al procesar el boceto con OpenAI: ${error.message}`);
            throw error;
        }
    }

    public async generateAngularComponents(params: {
        imageBase64: string;
        options: string;
    }): Promise<any>{
        try {
            if (!this.openai) {
                throw new Error('OpenAI no está inicializado. Verifica tu API key.');
            }

            const {imageBase64, options} = params;
            
            if (!imageBase64) {
                throw new Error('Se requiere proporcionar una imagen (imageBase64)');
            }
            
            const prompt = promptIAComponentsAngular(options);

            return await this.generateComponentsWithOpenAI(prompt, imageBase64);
        } catch (error) {
            this.logger.error(`Error al generar componentes Angular:`, error);
            throw new Error(`Error al generar componentes Angular: ` + error.message);
        }
    }

    private async generateComponentsWithOpenAI(prompt: string, imageBase64: string): Promise<any> {

        const response = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { 
                            type: "text", 
                            text: prompt 
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 4000,
            temperature: 0.7
        });

        const content = response.choices[0].message.content;

        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/) || [null, content];

        let jsonString = jsonMatch[1] || content;

        if(!jsonString.trim().startsWith('{')) {
            jsonString = jsonString.substring(jsonString.indexOf('{'));
        }

        if(!jsonString.trim().endsWith('}')) {
            jsonString = jsonString.substring(0, jsonString.lastIndexOf('}') + 1);
        }

        return JSON.parse(jsonString);
    }

    private transformToElementsArray(data: any): Element[] {
        const elements = [];
        for (const key in data) {
            if (typeof data[key] === 'object' && data[key] !== null) {
                if (data[key].type) {
                    elements.push(data[key]);
                }
            }
        }
        return elements;
    }

    private createDefaultElements(): Element[] {
        return [
            {
                type: "rectangle",
                left: 100,
                top: 100,
                width: 200,
                height: 150,
                fill: "#e0e0e0",
                objectId: uuidv4(),
                x: 100,
                y: 100
            },
            {
                type: "circle",
                left: 400,
                top: 300,
                radius: 75,
                fill: "#d0d0d0",
                objectId: uuidv4(),
                x: 400,
                y: 300
            },
            {
                type: "text",
                left: 250,
                top: 400,
                text: "Boceto detectado",
                fill: "#000000",
                fontFamily: "Helvetica",
                fontSize: 24,
                fontWeight: "400",
                objectId: uuidv4(),
                x: 250,
                y: 400
            }
        ];
    }
}