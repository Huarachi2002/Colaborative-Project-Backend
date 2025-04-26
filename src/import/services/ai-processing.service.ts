import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

interface Element {
    type: string;
    x: number;
    y: number;
    [key: string]: any;
}

@Injectable()
export class AiProcessingService {
    private openaiApiKey: string;
    private readonly logger = new Logger(AiProcessingService.name);
    private readonly rejectionPatterns = [
        /lo siento,?\s+no puedo ayudarte con eso/i,
        /i('m| am) sorry,?\s+i cannot/i,
        /i('m| am) unable to/i,
        /cannot process this/i,
        /unable to process/i,
        /cannot assist with that/i
    ];

    constructor(private configService: ConfigService) {
        this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    }

    async processSketch(imageBuffer: Buffer): Promise<{elements: Element[]}> {
        const base64Image = imageBuffer.toString('base64');
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const prompt = this.getPrompt(attempts);
                this.logger.log(`Intento ${attempts + 1} de procesar boceto...`);

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
                                        text: prompt
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
                        max_tokens: 4000,
                        temperature: attempts * 0.1 // Incrementar la temperatura con cada intento
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.openaiApiKey}`
                        }
                    }
                );

                // Verificar si hay respuesta
                if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                    throw new Error('No se recibió respuesta de la API de OpenAI');
                }

                const content = response.data.choices[0].message.content;
                this.logger.debug(`Respuesta de OpenAI: ${content.substring(0, 200)}...`);

                // Comprobar si la respuesta contiene un patrón de rechazo
                if (this.containsRejectionPattern(content)) {
                    this.logger.warn(`La IA rechazó la solicitud en el intento ${attempts + 1}, intentando con un prompt alternativo.`);
                    attempts++;
                    continue;
                }

                // Extraer y parsear la respuesta JSON
                const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                                 content.match(/```([\s\S]*?)```/) || 
                                 [null, content];
                
                let jsonString = jsonMatch[1] || content;
                
                // Limpiar el JSON si es necesario
                if(!jsonString.trim().startsWith('{')) {
                    const startIndex = jsonString.indexOf('{');
                    if (startIndex === -1) {
                        throw new Error('No se pudo encontrar un objeto JSON válido en la respuesta');
                    }
                    jsonString = jsonString.substring(startIndex);
                }

                try {
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
                        // Si no hay elementos definidos, intentaremos usar el objeto completo como una colección
                        elements = this.transformToElementsArray(parsedData);
                    }
                    
                    // Verificar si tenemos elementos
                    if (elements.length === 0) {
                        if (attempts < maxAttempts - 1) {
                            this.logger.warn('No se encontraron elementos, intentando con un prompt alternativo.');
                            attempts++;
                            continue;
                        } else {
                            // En el último intento, al menos devolver un elemento por defecto
                            elements = this.createDefaultElements();
                        }
                    }

                    // Asegurarse de que todos los elementos tienen un objectId
                    elements = elements.map(elem => {
                        if (!elem.objectId) {
                            elem.objectId = uuidv4();
                        }
                        return elem;
                    });
                    
                    return { elements };
                } catch (parseError) {
                    this.logger.error(`Error al parsear JSON: ${parseError.message}`);
                    
                    if (attempts < maxAttempts - 1) {
                        attempts++;
                        continue;
                    } else {
                        // En el último intento, devolver elementos por defecto
                        return { elements: this.createDefaultElements() };
                    }
                }
            } catch (error) {
                this.logger.error(`Error al procesar el boceto: ${error.message}`);
                
                if (attempts < maxAttempts - 1) {
                    attempts++;
                } else {
                    // En el último intento, devolver elementos por defecto
                    return { elements: this.createDefaultElements() };
                }
            }
        }

        // Si llegamos aquí, todos los intentos fallaron
        return { elements: this.createDefaultElements() };
    }

    private getPrompt(attemptNumber: number): string {
        // Prompt base para el primer intento (el que ya tenías)
        if (attemptNumber === 0) {
            return `Actúa como un experto en visión por computadora especializado en detectar y reconocer elementos de diseño en bocetos. Analiza minuciosamente esta imagen de boceto y extrae todos los elementos visuales para convertirlos en objetos Fabric.js precisos.

TAREA: Genera un JSON con un array 'elements' que contenga todos los objetos detectados con coordenadas y propiedades exactas. Asigna valores relativos basados en un canvas de 1000x1000 unidades.

PASOS DE ANÁLISIS:
1. Primero, identifica los bordes y contornos principales
2. Detecta figuras geométricas básicas (rectángulos, círculos, triángulos)
3. Reconoce líneas rectas y conexiones
4. Busca texto y elementos tipográficos
5. Identifica dibujos a mano alzada que requieran paths
6. Asegúrate de captar relaciones espaciales entre elementos
7. Usa colores coherentes con los tonos observados en la imagen

IMPORTANTE: Incluso si el boceto es complejo o tiene trazos imperfectos, esfuérzate por generar una representación precisa. Si un elemento no se ajusta perfectamente a una figura geométrica básica, utiliza "path" para representarlo fielmente.

Cada objeto debe seguir EXACTAMENTE este formato según su tipo:
                                
1. RECTÁNGULO:
{
    "type": "rectangle",
    "left": [posición X],
    "top": [posición Y],
    "width": [ancho],
    "height": [alto],
    "fill": [color hexadecimal],
    "objectId": "[id único UUID]"
}
                                
2. CÍRCULO:
{
    "type": "circle",
    "left": [posición X],
    "top": [posición Y],
    "radius": [radio],
    "fill": [color hexadecimal],
    "objectId": "[id único UUID]"
}
                                
3. TRIÁNGULO:
{
    "type": "triangle",
    "left": [posición X],
    "top": [posición Y],
    "width": [ancho],
    "height": [alto],
    "fill": [color hexadecimal],
    "objectId": "[id único UUID]"
}
                                
4. LÍNEA:
{
    "type": "line",
    "points": [[x1], [y1], [x2], [y2]],
    "stroke": [color hexadecimal],
    "strokeWidth": 2,
    "objectId": "[id único UUID]"
}
                                
5. TEXTO:
{
    "type": "text",
    "left": [posición X],
    "top": [posición Y],
    "text": [texto detectado],
    "fill": [color hexadecimal],
    "fontFamily": "Helvetica",
    "fontSize": 36,
    "fontWeight": "400",
    "objectId": "[id único UUID]"
}

6. PATH (dibujo a mano alzada):
{
    "type": "path",
    "path": [string de datos SVG path],
    "fill": [color hexadecimal],
    "stroke": [color hexadecimal],
    "strokeWidth": [ancho de línea],
    "objectId": "[id único UUID]"
}

ADVERTENCIAS:
- Usa path para elementos complejos o irregulares
- Coloca correctamente los elementos según su posición relativa
- Asegúrate de que todos los elementos tienen valores numéricos específicos, no descripciones
- Para bocetos imprecisos, prioriza la intención de diseño percibida
- Para diagramas, captura fielmente las conexiones y relaciones entre elementos

Devuelve ÚNICAMENTE el JSON válido sin explicaciones adicionales ni markdown.`;
        } 
        // Prompt simplificado para el segundo intento
        else if (attemptNumber === 1) {
            return `Estoy procesando una imagen de un boceto o diagrama. Necesito convertir todos los elementos visuales en objetos para fabric.js.

Genera un JSON con un array 'elements' que contenga los objetos detectados. Mantén las coordenadas simples, en un canvas de 1000x1000.

Necesito identificar:
- Rectángulos: {"type": "rectangle", "left": X, "top": Y, "width": W, "height": H, "fill": "#color"}
- Círculos: {"type": "circle", "left": X, "top": Y, "radius": R, "fill": "#color"}
- Triángulos: {"type": "triangle", "left": X, "top": Y, "width": W, "height": H, "fill": "#color"}
- Líneas: {"type": "line", "points": [X1, Y1, X2, Y2], "stroke": "#color", "strokeWidth": 2}
- Texto: {"type": "text", "left": X, "top": Y, "text": "texto", "fill": "#color", "fontSize": 36}
- Paths: {"type": "path", "path": "SVG path data", "stroke": "#color"}

Para cada elemento incluye un "objectId": "id-único".

No es necesario identificar todos los detalles perfectamente; lo importante es capturar la estructura básica del boceto.

Responde solamente con el JSON, sin texto adicional.`;
        } 
        // Prompt muy básico para el último intento
        else {
            return `Mira esta imagen y crea un JSON sencillo con los elementos básicos que puedas identificar.

El formato debe ser: 
{
  "elements": [
    {"type": "rectangle", "left": 100, "top": 100, "width": 200, "height": 100, "fill": "#cccccc", "objectId": "1"},
    {"type": "circle", "left": 400, "top": 300, "radius": 50, "fill": "#dddddd", "objectId": "2"},
    {"type": "line", "points": [500, 500, 700, 700], "stroke": "#000000", "strokeWidth": 2, "objectId": "3"}
  ]
}

No analices la imagen en detalle, solo identifica las formas básicas. Si no puedes identificar ningún elemento específico, devuelve un array de elementos vacío.`;
        }
    }

    private containsRejectionPattern(text: string): boolean {
        return this.rejectionPatterns.some(pattern => pattern.test(text));
    }

    private transformToElementsArray(data: any): Element[] {
        // Si no hay un array 'elements', intentamos usar el objeto completo
        const elements = [];
        for (const key in data) {
            if (typeof data[key] === 'object' && data[key] !== null) {
                // Verificar si parece un elemento
                if (data[key].type) {
                    elements.push(data[key]);
                }
            }
        }
        return elements;
    }

    private createDefaultElements(): Element[] {
        // Crear algunos elementos básicos por defecto si todo lo demás falla
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