export const promptIABoceto:string = `Analiza esta imagen de boceto y extrae todos los elementos visuales para convertirlos en objetos JSON precisos.

TAREA: Genera un JSON con un array 'elements' que contenga todos los objetos detectados con coordenadas y propiedades exactas. Usa un canvas de 1000x1000 unidades.

PASOS:
1. Identifica los bordes y contornos principales
2. Detecta figuras geométricas básicas
3. Reconoce líneas rectas y conexiones
4. Busca texto y elementos tipográficos
5. Identifica dibujos a mano alzada que requieran paths
6. Captura relaciones espaciales entre elementos
7. Usa colores coherentes con los tonos observados en la imagen

IMPORTANTE: Si un elemento no se ajusta perfectamente a una figura geométrica básica, utiliza "path" para representarlo fielmente.

Cada objeto debe seguir este formato según su tipo:
                                                
1. RECTÁNGULO:
{
    "type": "rectangle",
    "left": [posición X],
    "top": [posición Y],
    "width": [ancho],
    "height": [alto],
    "fill": [color hexadecimal],
    "stroke": [color hexadecimal],
    "objectId": "[id único]"
}
                                                
2. CÍRCULO:
{
    "type": "circle",
    "left": [posición X],
    "top": [posición Y],
    "radius": [radio],
    "fill": [color hexadecimal],
    "stroke": [color hexadecimal],
    "objectId": "[id único]"
}
                                                
3. TRIÁNGULO:
{
    "type": "triangle",
    "left": [posición X],
    "top": [posición Y],
    "width": [ancho],
    "height": [alto],
    "fill": [color hexadecimal],
    "stroke": [color hexadecimal],
    "objectId": "[id único]"
}
                                                
4. LÍNEA:
{
    "type": "line",
    "points": [[x1], [y1], [x2], [y2]],
    "stroke": [color hexadecimal],
    "strokeWidth": 2,
    "objectId": "[id único]"
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
    "objectId": "[id único]"
}

6. PATH (dibujo a mano alzada):
{
    "type": "path",
    "path": [string de datos SVG path],
    "fill": [color hexadecimal],
    "stroke": [color hexadecimal],
    "strokeWidth": [ancho de línea],
    "objectId": "[id único]"
}

Devuelve ÚNICAMENTE el JSON válido sin explicaciones adicionales ni markdown.`;

export const promptSimplificadoIABoceto:string = `Analiza esta imagen de un boceto o diagrama y conviértela en objetos JSON.

Genera un JSON con un array 'elements' que contenga los objetos detectados en un canvas de 1000x1000.

Identifica:
- Rectángulos: {"type": "rectangle", "left": X, "top": Y, "width": W, "height": H, "fill": "#color", "stroke": "#color"}
- Círculos: {"type": "circle", "left": X, "top": Y, "radius": R, "fill": "#color", "stroke": "#color"}
- Triángulos: {"type": "triangle", "left": X, "top": Y, "width": W, "height": H, "fill": "#color", "stroke": "#color"}
- Líneas: {"type": "line", "points": [X1, Y1, X2, Y2], "stroke": "#color", "strokeWidth": 2}
- Texto: {"type": "text", "left": X, "top": Y, "text": "texto", "fill": "#color", "fontSize": 36}
- Paths: {"type": "path", "path": "SVG path data", "stroke": "#color"}

Incluye "objectId": "id-único" para cada elemento.

Responde solo con el JSON.`;

export const promptBasicoIABoceto:string = `Mira esta imagen y crea un JSON con formas básicas.

Formato: 
{
  "elements": [
    {"type": "rectangle", "left": 100, "top": 100, "width": 200, "height": 100, "fill": "#cccccc", "objectId": "1"},
    {"type": "circle", "left": 400, "top": 300, "radius": 50, "fill": "#dddddd", "objectId": "2"},
    {"type": "line", "points": [500, 500, 700, 700], "stroke": "#000000", "objectId": "3"}
  ]
}

Solo identifica formas básicas.`;

export const promptIAComponentsAngular = (imageBase64: string, options: string) => {
    return `Analiza esta imagen de un diagrama o mockup visual y genera un proyecto Angular completo basado en lo que ves.
    Proporciona el código para los componentes TypeScript (.ts), plantillas HTML (.html) y estilos SCSS (.scss).
    Pautas:

    1. Interpreta la imagen e identifica todos los componentes visuales (formularios, tablas, botones, etc).
    2. Genera todos los componentes Angular necesarios con su código completo y funcional.
    3. Crea una estructura de proyecto organizada y modular.
    4. Implementa estilos CSS/SCSS detallados para que coincidan exactamente con la imagen.
    5. Identifica las operaciones CRUD y genera servicios para consumir API REST.
    6. Crea interfaces y modelos para los datos.
    7. Implementa formularios reactivos para entradas de datos.
    8. Incluye validaciones de formularios y manejo de errores.
    9. Sigue las mejores prácticas de Angular.
    10. Genera un sistema de navegación entre vistas si se detectan múltiples pantallas.

    Opciones de proyecto: ${options}

    Responde con un objeto JSON con esta estructura:

    {
      "projectStructure": {
        "description": "Descripción de la estructura del proyecto y sus principales componentes"
      },
      "components": {
        "componentName1": {
          "ts": "contenido del archivo .ts",
          "html": "contenido del archivo .html",
          "scss": "contenido del archivo .scss"
        },
        "componentName2": {
          "ts": "...",
          "html": "...",
          "scss": "..."
        }
      },
      "services": {
        "serviceName1": "contenido del servicio que implementa operaciones CRUD",
        "serviceName2": "..."
      },
      "models": {
        "modelName1": "interfaz o clase del modelo",
        "modelName2": "..."
      },
      "modules": {
        "moduleName1": "contenido del módulo",
        "moduleName2": "..."
      },
      "routing": "configuración de rutas del proyecto"
    }

    Asegúrate de que el JSON sea válido y que cada componente tenga todo el código necesario para funcionar correctamente.
    El proyecto debe estar listo para ejecutarse a un 95% de completitud, solo requiriendo ajustes mínimos.`;
};