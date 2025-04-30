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

export const promptIAComponentsAngular = (options: string) => {
    return `Analiza esta imagen de un diagrama o mockup visual y genera un proyecto Angular completo basado en lo que ves.
    Eres un experto en Angular que genera código de alta calidad compatible con la versión más reciente de Angular.
    
    ## INSTRUCCIONES PRINCIPALES:

    1. ANÁLISIS DE LA IMAGEN:
       - Interpreta la imagen e identifica todos los componentes visuales (formularios, tablas, botones, menús, etc).
       - Reconoce la estructura y jerarquía de la interfaz (header, sidebar, main content, footer).
       - Identifica flujos de navegación o acciones del usuario implícitas.

    2. GENERACIÓN DE CÓDIGO DE COMPONENTES:
       - Crea componentes Angular STANDALONE para cada elemento significativo (compatibles con Angular 19+).
       - Asegúrate de que todos los componentes incluyan "standalone: true" en su decorador @Component.
       - Incluye los imports necesarios para cada componente (CommonModule, RouterModule, FormsModule, etc.)
       - Genera formularios reactivos con FormBuilder y ReactiveFormsModule donde sea apropiado.
       - Declara explícitamente todas las variables, inicializa @Input(), @Output() y utiliza tipos TypeScript.
       
    3. ESTRUCTURA Y SERVICIOS:
       - Implementa una estructura de rutas clara usando Routes en app.routes.ts (modelo standalone).
       - Asegura que todos los servicios usen el decorador @Injectable({providedIn: 'root'}).
       - Implementa servicios CRUD completos con HttpClient y environment.
       - Utiliza observables (rxjs) para comunicación reactiva entre componentes.

    4. INTEGRACIÓN Y BUENAS PRÁCTICAS:
       - Asegúrate de que app.component incluya router-outlet si estás usando rutas.
       - Incluye imports completos y correctos en cada archivo.
       - Asegura que las propiedades @Input tengan inicialización de valor por defecto.
       - Evita código duplicado y aislado que no se integre en el proyecto.
       - Implementa interfaces o modelos para las estructuras de datos.
       - Usa herencia o composición cuando sea apropiado para código reutilizable.

    ## ESPECÍFICAMENTE PARA ANGULAR 19+:
    - Usa únicamente componentes standalone (no módulos NgModule, excepto para librerías externas).
    - Configura correctamente en app.config.ts si es necesario.
    - Utiliza el bootstrap con provideRouter en vez de los módulos de enrutamiento antiguos.
    - Asegúrate que todos los componentes declaren sus dependencias en el array "imports" del decorador.
    - Evita referencias a NgModule o a estrategias anteriores de organización de código.
    
    ## PREVENCIÓN DE ERRORES COMUNES:
    - Inicializa SIEMPRE valores para propiedades @Input() (ej: @Input() title: string = '';)
    - Implementa siempre la interfaz OnInit si usas ngOnInit().
    - Incluye CommonModule en los imports si usas directivas como *ngIf o *ngFor.
    - Implementa servicios con observables BehaviorSubject para estado compartido.
    - No dupliques funciones o métodos entre componentes.
    - Utiliza tipado fuerte en todas las variables y funciones.
    - Asegúrate de que las rutas sean correctas y no contengan caracteres especiales.

    ## ESTRUCTURA JSON REQUERIDA DE LA RESPUESTA:

    Opciones de proyecto: ${options}

    Responde con un objeto JSON con exactamente esta estructura:

    {
      "projectStructure": {
        "description": "Descripción detallada de la estructura del proyecto y cómo se relacionan los componentes"
      },
      "appComponent": {
        "html": "Código completo para app.component.html con router-outlet si usa rutas",
        "ts": "Código para app.component.ts con standalone:true y todos los imports",
        "scss": "Estilos para app.component.scss con diseño responsive"
      },
      "components": {
        "component-name-1": {
          "ts": "Código TypeScript para el componente con todas las importaciones, validaciones y lógica",
          "html": "Plantilla HTML completa con eventos y bindings",
          "scss": "Estilos SCSS específicos para este componente"
        },
        "component-name-2": {
          "ts": "...",
          "html": "...",
          "scss": "..."
        }
      },
      "services": {
        "data.service": "// Implementación completa del servicio con métodos CRUD",
        "auth.service": "// Servicio de autenticación si es aplicable"
      },
      "models": {
        "user.model": "// Interface o clase con propiedades tipadas",
        "product.model": "// Otro modelo si corresponde"
      },
      "routing": "// Contenido de app.routes.ts con rutas bien definidas"
    }

    IMPORTANTE: Todos los nombres de componentes deben usar kebab-case y cada componente debe estar completo y funcional.
    Asegúrate de que cada archivo tenga todas las importaciones necesarias y que el código esté correctamente tipado.
    Cada componente debe ser standalone e importar sus dependencias directamente.
    El JSON resultante debe ser válido y sin errores de sintaxis.
    Evitar métodos o funciones parcialmente implementadas con "// TODO" o código incompleto.`;
};