import { Injectable, Logger } from "@nestjs/common";
import { AiProcessingService } from "src/import/services/ai-processing.service";
import * as JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

@Injectable()
export class ExportService {
    private readonly logger = new Logger(ExportService.name);
    
    constructor(
        private readonly aiProcessingService: AiProcessingService
    ) {}

    public async generateAngularProject(createAngularDto: any): Promise<Buffer> {
        try {
            const { projectName, canvasImage, options } = createAngularDto;
            
            // Sanitizar el nombre del proyecto (eliminar espacios y caracteres especiales)
            const safeProjectName = this.sanitizeProjectName(projectName);
            
            // Crear un directorio único temporal para el proyecto
            const tempDir = path.join(process.cwd(), 'temp');
            const projectDir = path.join(tempDir, `angular-${safeProjectName}-${uuidv4()}`);
            
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            // Crear el directorio del proyecto
            fs.mkdirSync(projectDir, { recursive: true });
            
            // Generar el proyecto Angular usando Angular CLI
            await this.createAngularProject(projectDir, safeProjectName, options);
            
            // Si se proporciona una imagen del canvas, generar componentes
            if (canvasImage) {
                const generatedComponents = await this.generateComponentsFromCanvasImage(canvasImage, options);
                await this.addGeneratedComponentsToProject(projectDir, generatedComponents, options);
                
                // Modificar app.component.* para incluir los componentes generados
                await this.updateAppComponent(projectDir, generatedComponents, options);
            } else {
                throw new Error('Se requiere una imagen del canvas');
            }
            
            // Comprimir el proyecto en un archivo ZIP
            const zipBuffer = await this.zipProject(projectDir);
            
            // Limpiar los archivos temporales
            this.cleanupTempFiles(projectDir);
            
            return zipBuffer;
        } catch (error) {
            this.logger.error('Error generando proyecto Angular:', error);
            throw new Error('Error al generar el proyecto Angular: ' + error.message);
        }
    }
    
    private sanitizeProjectName(name: string): string {
        // Eliminar espacios y caracteres especiales, convertir a minúsculas
        return name
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9-_]/g, '')
            .toLowerCase();
    }
    
    private async createAngularProject(projectDir: string, projectName: string, options: any): Promise<void> {
        try {
            this.logger.log(`Generando proyecto Angular "${projectName}" en ${projectDir}...`);
            
            // Construir comando para ng new
            let ngNewCommand = `npx -p @angular/cli ng new ${projectName} --directory . --skip-git`;
            
            // Agregar opciones según la configuración
            if (options.cssFramework === 'scss' || options.cssFramework === 'sass') {
                ngNewCommand += ` --style=scss`;
            } else {
                ngNewCommand += ` --style=css`;
            }
            
            if (options.includeRouting) {
                ngNewCommand += ` --routing=true`;
            } else {
                ngNewCommand += ` --routing=false`;
            }
            
            // Ejecutar comando para crear el proyecto
            this.logger.log(`Ejecutando: ${ngNewCommand}`);
            await execAsync(ngNewCommand, { cwd: projectDir });
            
            // Instalar dependencias adicionales según el framework CSS
            if (options.cssFramework === 'bootstrap') {
                this.logger.log('Instalando Bootstrap...');
                await execAsync('npm install bootstrap', { cwd: projectDir });
                
                // Modificar angular.json para incluir Bootstrap
                this.addBootstrapToAngularJson(projectDir);
            } else if (options.cssFramework === 'material') {
                this.logger.log('Instalando Angular Material...');
                await execAsync('ng add @angular/material --skip-confirmation', { cwd: projectDir });
            }
            
            this.logger.log('Proyecto Angular generado correctamente');
        } catch (error) {
            this.logger.error('Error al generar proyecto Angular con CLI:', error);
            throw new Error('Error al ejecutar Angular CLI: ' + error.message);
        }
    }
    
    private addBootstrapToAngularJson(projectDir: string): void {
        const angularJsonPath = path.join(projectDir, 'angular.json');
        
        if (fs.existsSync(angularJsonPath)) {
            const angularJson = JSON.parse(fs.readFileSync(angularJsonPath, 'utf8'));
            const projectName = Object.keys(angularJson.projects)[0];
            const styles = angularJson.projects[projectName].architect.build.options.styles;
            const scripts = angularJson.projects[projectName].architect.build.options.scripts || [];
            
            // Agregar Bootstrap CSS si no está ya incluido
            if (!styles.includes('node_modules/bootstrap/dist/css/bootstrap.min.css')) {
                styles.push('node_modules/bootstrap/dist/css/bootstrap.min.css');
            }
            
            // Agregar Bootstrap JS si no está ya incluido
            if (!scripts.includes('node_modules/bootstrap/dist/js/bootstrap.bundle.min.js')) {
                scripts.push('node_modules/bootstrap/dist/js/bootstrap.bundle.min.js');
            }
            
            angularJson.projects[projectName].architect.build.options.scripts = scripts;
            
            fs.writeFileSync(angularJsonPath, JSON.stringify(angularJson, null, 2));
            this.logger.log('Bootstrap agregado a angular.json');
        }
    }
    
    private async generateComponentsFromCanvasImage(imageBase64: string, options: any): Promise<any> {
        try {
            // Eliminar el prefijo "data:image/jpeg;base64," si está presente
            if (imageBase64.includes('base64,')) {
                imageBase64 = imageBase64.split('base64,')[1];
            }

            // Mejorar el prompt para incluir instrucciones de compatibilidad y evitar errores comunes
            const enhancedOptions = {
                ...options,
                needsAppIntegration: true,
                angular19: true,
                preventCommonErrors: true
            };

            const componentCode = await this.aiProcessingService.generateAngularComponents({
                imageBase64: imageBase64,
                options: JSON.stringify(enhancedOptions),
            });

            // Post-procesar el código generado para corregir errores comunes
            return this.validateAndFixGeneratedComponents(componentCode);
        } catch (error) {
            this.logger.error('Error generando componentes con la imagen:', error);
            throw new Error('Error al generar componentes desde la imagen: ' + error.message);
        }
    }

    private validateAndFixGeneratedComponents(generatedComponents: any): any {
        this.logger.log('Validando y corrigiendo componentes generados...');
        
        try {
            const fixedComponents = { ...generatedComponents };
            
            // Corregir componentes
            if (fixedComponents.components) {
                for (const componentName in fixedComponents.components) {
                    const component = fixedComponents.components[componentName];
                    
                    // Corregir archivo TS
                    if (component.ts) {
                        component.ts = this.fixComponentTsFile(componentName, component.ts);
                    }
                    
                    // Corregir archivo HTML
                    if (component.html) {
                        component.html = this.fixComponentHtmlFile(component.html);
                    }
                }
            }
            
            // Corregir servicios
            if (fixedComponents.services) {
                for (const serviceName in fixedComponents.services) {
                    fixedComponents.services[serviceName] = this.fixServiceFile(
                        serviceName, fixedComponents.services[serviceName]
                    );
                }
            }
            
            // Asegurarse de que existe la configuración de rutas
            if (!fixedComponents.routing && fixedComponents.components) {
                fixedComponents.routing = this.generateRoutingFile(fixedComponents.components);
            } else if (fixedComponents.routing) {
                fixedComponents.routing = this.fixRoutingFile(fixedComponents.routing, fixedComponents.components);
            }
            
            // Asegurar que exista el componente app
            if (!fixedComponents.appComponent) {
                fixedComponents.appComponent = this.generateAppComponent(fixedComponents.components);
            } else {
                // Corregir el app component existente
                if (fixedComponents.appComponent.ts) {
                    fixedComponents.appComponent.ts = this.fixAppComponentTsFile(fixedComponents.appComponent.ts, fixedComponents.components);
                }
                if (fixedComponents.appComponent.html) {
                    fixedComponents.appComponent.html = this.fixAppComponentHtmlFile(fixedComponents.appComponent.html, fixedComponents.components);
                }
            }
            
            return fixedComponents;
        } catch (error) {
            this.logger.error('Error validando componentes generados:', error);
            return generatedComponents; // Devolver los componentes originales si hay un error
        }
    }

    private fixComponentTsFile(componentName: string, tsContent: string): string {
        // 1. Asegurar que sea un componente standalone
        if (!tsContent.includes('standalone: true')) {
            tsContent = tsContent.replace(
                /@Component\(\{/,
                '@Component({\n  standalone: true,'
            );
        }
        
        // 2. Asegurar que tenga imports correctos
        if (tsContent.includes('*ngFor') || tsContent.includes('*ngIf') || 
            tsContent.includes('[(ngModel)]') || tsContent.includes('[ngClass]')) {
            
            if (!tsContent.includes('imports: [')) {
                tsContent = tsContent.replace(
                    /@Component\(\{/,
                    '@Component({\n  imports: [CommonModule],'
                );
            } else if (!tsContent.includes('CommonModule')) {
                tsContent = tsContent.replace(
                    /imports: \[/,
                    'imports: [CommonModule, '
                );
            }
            
            // Añadir importación de CommonModule si no existe
            if (!tsContent.includes('import { CommonModule }')) {
                tsContent = tsContent.replace(
                    /import { Component/,
                    'import { Component, NgModule } from \'@angular/core\';\nimport { CommonModule } from \'@angular/common\';'
                );
            }
        }
        
        // 3. Si el componente usa formularios, añadir ReactiveFormsModule
        if (tsContent.includes('FormGroup') || tsContent.includes('formGroup') || 
            tsContent.includes('FormBuilder') || tsContent.includes('FormControl')) {
            
            // Añadir ReactiveFormsModule a imports
            if (!tsContent.includes('imports: [')) {
                tsContent = tsContent.replace(
                    /@Component\(\{/,
                    '@Component({\n  imports: [CommonModule, ReactiveFormsModule],'
                );
            } else if (!tsContent.includes('ReactiveFormsModule')) {
                tsContent = tsContent.replace(
                    /imports: \[(.*?)\]/,
                    (match, p1) => `imports: [${p1}${p1.trim() ? ', ' : ''}ReactiveFormsModule]`
                );
            }
            
            // Añadir importación de ReactiveFormsModule si no existe
            if (!tsContent.includes('import { ReactiveFormsModule }')) {
                tsContent = tsContent.replace(
                    /import { Component/,
                    'import { Component } from \'@angular/core\';\nimport { ReactiveFormsModule, FormGroup, FormBuilder } from \'@angular/forms\';\nimport { CommonModule } from \'@angular/common\';'
                );
            }
        }
        
        // 4. Si hay propiedades @Input sin inicializar, inicializarlas
        tsContent = tsContent.replace(
            /@Input\(\)\s+(\w+)\s*:\s*string;/g,
            '@Input() $1: string = \'\';'
        );
        
        tsContent = tsContent.replace(
            /@Input\(\)\s+(\w+)\s*:\s*number;/g,
            '@Input() $1: number = 0;'
        );
        
        tsContent = tsContent.replace(
            /@Input\(\)\s+(\w+)\s*:\s*boolean;/g,
            '@Input() $1: boolean = false;'
        );
        
        tsContent = tsContent.replace(
            /@Input\(\)\s+(\w+)\s*:\s*any;/g,
            '@Input() $1: any = null;'
        );
        
        // 5. Asegurarnos de que el selector sea correcto y consistente
        if (!tsContent.includes(`selector: 'app-${componentName}'`)) {
            tsContent = tsContent.replace(
                /selector: ['"].*?['"],/,
                `selector: 'app-${componentName}',`
            );
            
            // Si no hay un selector, añadirlo
            if (!tsContent.includes('selector:')) {
                tsContent = tsContent.replace(
                    /@Component\(\{/,
                    `@Component({\n  selector: 'app-${componentName}',`
                );
            }
        }
        
        // 6. Asegurar que la clase tenga implementación de OnInit si la usa
        if (tsContent.includes('ngOnInit') && !tsContent.includes('implements OnInit')) {
            tsContent = tsContent.replace(
                /export class (\w+Component)/,
                'export class $1 implements OnInit'
            );
            
            // Añadir importación de OnInit si no existe
            if (!tsContent.includes('import { OnInit }')) {
                tsContent = tsContent.replace(
                    /import { Component/,
                    'import { Component, OnInit'
                );
            }
        }
        
        return tsContent;
    }

    private fixComponentHtmlFile(htmlContent: string): string {
        // Corregir uso de ngModel sin importación
        if (htmlContent.includes('[(ngModel)]') && !htmlContent.includes('formControlName')) {
            // Esto requeriría cambiar también el TS para importar FormsModule
            // (se maneja en fixComponentTsFile)
        }
        
        // Corregir uso de formGroup sin ReactiveFormsModule
        if (htmlContent.includes('[formGroup]') || htmlContent.includes('formControlName')) {
            // Esto requeriría cambiar también el TS para importar ReactiveFormsModule
            // (se maneja en fixComponentTsFile)
        }
        
        return htmlContent;
    }

    private fixServiceFile(serviceName: string, serviceContent: string): string {
        // 1. Asegurar que el servicio tenga decorador Injectable y providedIn: 'root'
        if (!serviceContent.includes('@Injectable')) {
            serviceContent = `import { Injectable } from '@angular/core';\n\n@Injectable({\n  providedIn: 'root'\n})\n${serviceContent}`;
        } else if (!serviceContent.includes('providedIn')) {
            serviceContent = serviceContent.replace(
                /@Injectable\(\)/,
                `@Injectable({\n  providedIn: 'root'\n})`
            );
        }
        
        return serviceContent;
    }

    private generateRoutingFile(components: any): string {
        let routingContent = `import { Routes } from '@angular/router';\n`;
        
        // Importar componentes
        for (const componentName in components) {
            const className = this.getComponentClassName(componentName);
            routingContent += `import { ${className} } from './components/${componentName}/${componentName}.component';\n`;
        }
        
        routingContent += `\nexport const routes: Routes = [\n`;
        
        // Crear rutas para cada componente
        const componentEntries = Object.entries(components);
        componentEntries.forEach(([componentName, component], index) => {
            const className = this.getComponentClassName(componentName);
            const path = componentName.replace(/^app-/, '');
            routingContent += `  { path: '${path}', component: ${className} }${index < componentEntries.length - 1 ? ',' : ''}\n`;
        });
        
        // Añadir ruta por defecto si hay al menos un componente
        if (componentEntries.length > 0) {
            const [firstComponentName] = componentEntries[0];
            const defaultPath = firstComponentName.replace(/^app-/, '');
            routingContent += `,\n  { path: '', redirectTo: '${defaultPath}', pathMatch: 'full' }\n`;
        }
        
        routingContent += `];\n`;
        
        return routingContent;
    }

    /**
     * Corrige errores comunes en el archivo de rutas
     */
    private fixRoutingFile(routingContent: string, components: any): string {
        // 1. Asegurar que tenga la importación de Routes
        if (!routingContent.includes('import { Routes }')) {
            routingContent = `import { Routes } from '@angular/router';\n${routingContent}`;
        }
        
        // 2. Asegurar que exporte las rutas
        if (!routingContent.includes('export const routes')) {
            routingContent = routingContent.replace(
                /const routes/,
                'export const routes'
            );
        }
        
        // 3. Verificar importaciones de componentes
        for (const componentName in components) {
            const className = this.getComponentClassName(componentName);
            if (routingContent.includes(className) && !routingContent.includes(`import { ${className} }`)) {
                routingContent = `import { ${className} } from './components/${componentName}/${componentName}.component';\n${routingContent}`;
            }
        }
        
        return routingContent;
    }

    /**
     * Corrige errores comunes en el archivo app.component.ts
     */
    private fixAppComponentTsFile(tsContent: string, components: any): string {
        // 1. Asegurar que sea un componente standalone
        if (!tsContent.includes('standalone: true')) {
            tsContent = tsContent.replace(
                /@Component\(\{/,
                '@Component({\n  standalone: true,'
            );
        }
        
        // 2. Asegurar que tenga imports correctos para los componentes usados
        const componentImports = [];
        const usedComponents = [];
        
        // Analizar qué componentes se usan en el HTML
        for (const componentName in components) {
            // Verificar si el HTML del app component usa el selector de este componente
            if (tsContent.includes(`app-${componentName}`)) {
                usedComponents.push(componentName);
            }
        }
        
        // Agregar imports para los componentes usados
        for (const componentName of usedComponents) {
            const className = this.getComponentClassName(componentName);
            
            // Añadir importación del componente si no existe
            if (!tsContent.includes(`import { ${className} }`)) {
                componentImports.push(`import { ${className} } from './components/${componentName}/${componentName}.component';`);
            }
            
            // Asegurar que el componente está en el array imports
            if (!tsContent.includes(`imports: [`) && componentImports.length > 0) {
                tsContent = tsContent.replace(
                    /@Component\(\{/,
                    '@Component({\n  imports: [RouterOutlet, CommonModule],'
                );
            }
        }
        
        // 3. Añadir imports si no están presentes
        if (componentImports.length > 0) {
            tsContent = `${componentImports.join('\n')}\n${tsContent}`;
            
            // Añadir componentes al array imports
            for (const componentName of usedComponents) {
                const className = this.getComponentClassName(componentName);
                if (!tsContent.includes(className) && tsContent.includes('imports: [')) {
                    tsContent = tsContent.replace(
                        /imports: \[(.*?)\]/,
                        (match, p1) => `imports: [${p1}${p1.trim() ? ', ' : ''}${className}]`
                    );
                }
            }
        }
        
        // 4. Asegurar que RouterOutlet y CommonModule están importados
        if (!tsContent.includes('import { RouterOutlet }')) {
            tsContent = `import { RouterOutlet } from '@angular/router';\n${tsContent}`;
        }
        
        if (!tsContent.includes('import { CommonModule }')) {
            tsContent = `import { CommonModule } from '@angular/common';\n${tsContent}`;
        }
        
        if (tsContent.includes('imports: [') && !tsContent.includes('RouterOutlet')) {
            tsContent = tsContent.replace(
                /imports: \[/,
                'imports: [RouterOutlet, '
            );
        }
        
        return tsContent;
    }

    /**
     * Corrige errores comunes en el archivo app.component.html
     */
    private fixAppComponentHtmlFile(htmlContent: string, components: any): string {
        // Verificar si el componente tiene router-outlet
        const hasRouterOutlet = htmlContent.includes('<router-outlet></router-outlet>') || 
                                htmlContent.includes('<router-outlet/>');
        
        // Si no hay router-outlet pero hay componentes, agregar el router-outlet
        if (!hasRouterOutlet && Object.keys(components).length > 0) {
            // Si hay una sección main o div principal, añadir router-outlet ahí
            if (htmlContent.includes('<main>') || htmlContent.includes('<div class="main">')) {
                htmlContent = htmlContent.replace(
                    /(<main.*?>|<div class="main".*?>)/,
                    '$1\n  <router-outlet></router-outlet>'
                );
            } else {
                // Si no, añadir un div con router-outlet al final
                htmlContent += '\n<div class="content">\n  <router-outlet></router-outlet>\n</div>\n';
            }
        }
        
        return htmlContent;
    }

    /**
     * Genera un componente app básico y funcional
     */
    private generateAppComponent(components: any): any {
        const componentNames = Object.keys(components);
        
        // HTML para app.component.html
        let html = `<div class="app-container">
  <header class="app-header">
    <h1>Aplicación Angular</h1>
    <nav class="app-nav">
      <ul>`;
        
        // Añadir enlaces de navegación para cada componente
        for (const componentName of componentNames) {
            const routePath = componentName.replace(/^app-/, '');
            const displayName = componentName
                .replace(/^app-/, '')
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            
            html += `
        <li><a routerLink="/${routePath}" routerLinkActive="active">${displayName}</a></li>`;
        }
        
        html += `
      </ul>
    </nav>
  </header>

  <main class="app-content">
    <router-outlet></router-outlet>
  </main>

  <footer class="app-footer">
    <p>&copy; ${new Date().getFullYear()} - Aplicación Angular</p>
  </footer>
</div>`;
        
        // TypeScript para app.component.ts
        let ts = `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Aplicación Angular';
}`;
        
        // CSS/SCSS para app.component.scss
        let scss = `.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  background-color: #3f51b5;
  color: white;
  padding: 1rem;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

.app-header h1 {
  margin: 0;
  font-size: 1.8rem;
}

.app-nav ul {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 1rem 0 0 0;
}

.app-nav li {
  margin-right: 1rem;
}

.app-nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.app-nav a:hover, .app-nav a.active {
  background-color: rgba(255, 255, 255, 0.2);
}

.app-content {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.app-footer {
  background-color: #f5f5f5;
  color: #555;
  text-align: center;
  padding: 1rem;
  margin-top: 2rem;
}`;
        
        return {
            html,
            ts,
            scss
        };
    }
    
    private async addGeneratedComponentsToProject(projectDir: string, generatedComponents: any, options: any): Promise<void> {
        try {
            this.logger.log('Añadiendo componentes generados por la IA al proyecto...');
            
            // Determinar si estamos usando Angular con componentes standalone
            const isStandaloneComponent = this.isUsingStandaloneComponents(projectDir);
            const isAngular19Plus = this.determineAngularVersion() >= 19;
            
            // Crear directorio para componentes si no existe
            const componentsDir = path.join(projectDir, 'src', 'app', 'components');
            if (!fs.existsSync(componentsDir)) {
                fs.mkdirSync(componentsDir, { recursive: true });
            }
            
            // Crear directorio para servicios si no existe
            const servicesDir = path.join(projectDir, 'src', 'app', 'services');
            if (!fs.existsSync(servicesDir)) {
                fs.mkdirSync(servicesDir, { recursive: true });
            }
            
            // Crear directorio para modelos si no existe
            const modelsDir = path.join(projectDir, 'src', 'app', 'models');
            if (!fs.existsSync(modelsDir)) {
                fs.mkdirSync(modelsDir, { recursive: true });
            }
            
            // Mantener un registro de componentes generados para referencias cruzadas
            const createdComponents = new Map();
            
            // 1. Generar componentes - conservando el contenido creado por la IA
            if (generatedComponents.components) {
                this.logger.log('Generando estructura para componentes usando Angular CLI...');
                
                for (const componentName in generatedComponents.components) {
                    try {
                        const component = generatedComponents.components[componentName];
                        const sanitizedName = componentName.replace(/^app-/, ''); // Eliminar prefijo app- si existe
                        
                        // 1.A. Generar estructura base del componente con el CLI
                        let command = `cd "${projectDir}" && npx ng generate component components/${sanitizedName} --skip-tests`;
                        
                        // Aplicar opciones según la versión y configuración
                        if (isAngular19Plus) {
                            command += ` --standalone`;
                        }
                        
                        const styleExt = this.getStyleExtensionFromAngularJson(projectDir);
                        command += ` --style=${styleExt}`;
                        
                        this.logger.log(`Generando estructura para componente ${sanitizedName} con Angular CLI...`);
                        await execAsync(command);
                        
                        // 1.B. Preservar el contenido generado por la IA
                        const componentDir = path.join(componentsDir, sanitizedName);
                        
                        // Actualizar HTML con el contenido de la IA
                        if (component.html) {
                            fs.writeFileSync(path.join(componentDir, `${sanitizedName}.component.html`), component.html);
                        }
                        
                        // Actualizar CSS/SCSS con el contenido de la IA
                        if (component.scss || component.css) {
                            fs.writeFileSync(
                                path.join(componentDir, `${sanitizedName}.component.${styleExt}`), 
                                component.scss || component.css
                            );
                        }
                        
                        // Fusionar el TS generado por el CLI con el contenido de la IA
                        if (component.ts) {
                            const cliGeneratedTs = fs.readFileSync(path.join(componentDir, `${sanitizedName}.component.ts`), 'utf8');
                            const aiGeneratedTs = component.ts;
                            
                            // Extraer lógica de componente de la IA pero preservar estructura del CLI
                            const mergedTs = this.mergeComponentContent(cliGeneratedTs, aiGeneratedTs);
                            fs.writeFileSync(path.join(componentDir, `${sanitizedName}.component.ts`), mergedTs);
                            
                            // Guardar referencia al componente para referencias cruzadas
                            createdComponents.set(componentName, {
                                name: sanitizedName,
                                className: this.getComponentClassName(sanitizedName),
                                path: `./components/${sanitizedName}/${sanitizedName}.component`
                            });
                        }
                    } catch (error) {
                        this.logger.error(`Error generando estructura para componente ${componentName}: ${error.message}`);
                        
                        // Si falla el CLI, crear manualmente preservando el contenido de la IA
                        await this.addComponentManually(projectDir, componentName, generatedComponents.components[componentName]);
                    }
                }
            }
            
            // 2. Generar servicios - mezclando servicios IA con CRUD autogenerado
            if (generatedComponents.services) {
                this.logger.log('Generando estructura para servicios usando Angular CLI...');
                
                for (const serviceName in generatedComponents.services) {
                    try {
                        const sanitizedName = serviceName.replace(/Service$/, '').toLowerCase();
                        
                        // 2.A. Generar estructura base del servicio con el CLI
                        const command = `cd "${projectDir}" && npx ng generate service services/${sanitizedName} --skip-tests`;
                        
                        this.logger.log(`Generando estructura para servicio ${sanitizedName} con Angular CLI...`);
                        await execAsync(command);
                        
                        // 2.B. Preservar el contenido generado por la IA
                        const servicePath = path.join(servicesDir, `${sanitizedName}.service.ts`);
                        
                        if (fs.existsSync(servicePath)) {
                            // Extraer funcionalidades específicas de la IA pero preservar estructura del CLI
                            const cliGeneratedService = fs.readFileSync(servicePath, 'utf8');
                            const aiGeneratedService = generatedComponents.services[serviceName];
                            
                            const mergedService = this.mergeServiceContent(cliGeneratedService, aiGeneratedService);
                            fs.writeFileSync(servicePath, mergedService);
                        }
                    } catch (error) {
                        this.logger.error(`Error generando estructura para servicio ${serviceName}: ${error.message}`);
                        
                        // Si falla el CLI, escribir el servicio directamente preservando el contenido de la IA
                        const serviceContent = generatedComponents.services[serviceName];
                        const sanitizedName = serviceName.replace(/Service$/, '').toLowerCase();
                        fs.writeFileSync(path.join(servicesDir, `${sanitizedName}.service.ts`), serviceContent);
                    }
                }
            }
            
            // 3. Detectar y generar modelos a partir del contenido de la IA
            const detectedModels = this.detectModelsFromComponents(generatedComponents.components || {});
            
            if (Object.keys(detectedModels).length > 0 || generatedComponents.models) {
                this.logger.log('Generando modelos basados en componentes detectados...');
                
                // Combinar modelos explícitos con los detectados automáticamente
                const allModels = { ...(generatedComponents.models || {}), ...detectedModels };
                
                for (const modelName in allModels) {
                    const sanitizedName = modelName.toLowerCase();
                    const modelContent = allModels[modelName];
                    fs.writeFileSync(path.join(modelsDir, `${sanitizedName}.model.ts`), modelContent);
                }
            }
            
            // 4. Generar servicios CRUD basados en modelos detectados
            if (Object.keys(detectedModels).length > 0 && options.generateCrud !== false) {
                this.logger.log('Generando servicios CRUD para modelos detectados...');
                
                for (const modelName in detectedModels) {
                    const sanitizedName = modelName.toLowerCase();
                    const serviceFileName = `${sanitizedName}.service.ts`;
                    const servicePath = path.join(servicesDir, serviceFileName);
                    
                    // Verificar si ya existe un servicio para este modelo
                    if (!fs.existsSync(servicePath)) {
                        // Generar servicio CRUD
                        const crudServiceContent = this.generateCrudServiceForModel(modelName, detectedModels[modelName]);
                        fs.writeFileSync(servicePath, crudServiceContent);
                    } else {
                        // Si ya existe, verificar si tiene operaciones CRUD
                        const existingService = fs.readFileSync(servicePath, 'utf8');
                        if (!this.serviceHasCrudOperations(existingService)) {
                            // Mejorarlo con operaciones CRUD
                            const enhancedService = this.enhanceServiceWithCrud(existingService, modelName);
                            fs.writeFileSync(servicePath, enhancedService);
                        }
                    }
                }
            }
            
            // 5. Actualizar módulos y configuración de rutas
            if (options.includeRouting) {
                this.logger.log('Actualizando configuración de rutas...');
                
                if (isStandaloneComponent || isAngular19Plus) {
                    // Para Angular 19+/standalone components
                    await this.updateAppRoutesForStandalone(projectDir, createdComponents);
                    await this.updateAppConfig(projectDir, options);
                } else {
                    // Para Angular < 19 con módulos
                    await this.updateRoutingModule(projectDir, generatedComponents);
                }
            }
            
            // 6. Actualizar el componente principal (app)
            this.logger.log('Actualizando componente principal de la aplicación...');
            
            if (generatedComponents.appComponent) {
                // Si la IA generó un componente app específico, usarlo
                this.updateAppComponentWithAiGenerated(projectDir, generatedComponents.appComponent, options);
            } else {
                // Sino, crear un componente app adaptado a los componentes generados
                this.updateAppComponent(projectDir, generatedComponents, options);
            }
            
            // 7. Actualizar environment.ts para incluir la URL de la API
            await this.updateEnvironmentFile(projectDir);
            
            // 8. Verificar si hay errores en los componentes generados
            this.logger.log('Verificando componentes generados para posibles errores...');
            await this.verifyGeneratedComponents(projectDir, createdComponents);
            
            this.logger.log('Componentes generados por la IA añadidos correctamente al proyecto');
        } catch (error) {
            this.logger.error('Error añadiendo componentes generados:', error);
            throw new Error('Error al agregar componentes generados: ' + error.message);
        }
    }
    
    /**
     * Verifica si un servicio ya tiene operaciones CRUD
     */
    private serviceHasCrudOperations(serviceContent: string): boolean {
        const crudMethods = ['getAll', 'getById', 'create', 'update', 'delete'];
        const hasEnoughCrud = crudMethods.filter(method => serviceContent.includes(method)).length >= 3;
        return hasEnoughCrud;
    }
    
    /**
     * Mejora un servicio existente con operaciones CRUD
     */
    private enhanceServiceWithCrud(existingService: string, modelName: string): string {
        // Si ya tiene @Injectable y estructura básica, mantenerlos
        const className = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        const modelVarName = modelName.toLowerCase();
        
        // Buscar el final de la clase para añadir métodos CRUD
        const classEndIndex = existingService.lastIndexOf('}');
        
        if (classEndIndex === -1) {
            return existingService; // No se puede identificar la clase
        }
        
        // Añadir importaciones necesarias si no existen
        let enhancedService = existingService;
        
        if (!enhancedService.includes('import { HttpClient')) {
            enhancedService = enhancedService.replace(
                'import { Injectable',
                'import { HttpClient, HttpHeaders } from \'@angular/common/http\';\nimport { Observable, throwError } from \'rxjs\';\nimport { catchError, tap } from \'rxjs/operators\';\nimport { environment } from \'../../environments/environment\';\n\nimport { Injectable'
            );
        }
        
        // Verificar si hay una definición de modelo/interfaz
        if (!enhancedService.includes(`interface ${className}`) && !enhancedService.includes(`class ${className}`)) {
            // Añadir interfaz básica para el modelo
            enhancedService = `export interface ${className} {\n  id: number | string;\n  [key: string]: any;\n}\n\n` + enhancedService;
        }
        
        // Añadir propiedad para la URL de API si no existe
        if (!enhancedService.includes('apiUrl')) {
            const constructorMatch = enhancedService.match(/constructor\s*\((.*?)\)\s*{/);
            if (constructorMatch) {
                // Añadir HttpClient al constructor si no existe
                if (!constructorMatch[1].includes('http')) {
                    enhancedService = enhancedService.replace(
                        constructorMatch[0],
                        `constructor(private http: HttpClient) {`
                    );
                }
                
                // Añadir apiUrl después del constructor
                enhancedService = enhancedService.replace(
                    constructorMatch[0],
                    `${constructorMatch[0]}\n  private apiUrl = environment.apiUrl + '/${modelVarName}s';\n`
                );
            }
        }
        
        // Preparar métodos CRUD para añadir
        const crudMethods = `
  /**
   * Obtiene todos los registros
   */
  getAll(): Observable<${className}[]> {
    return this.http.get<${className}[]>(this.apiUrl).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Obtiene un registro por su ID
   */
  getById(id: number | string): Observable<${className}> {
    const url = \`\${this.apiUrl}/\${id}\`;
    return this.http.get<${className}>(url).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Crea un nuevo registro
   */
  create(${modelVarName}: Omit<${className}, 'id'>): Observable<${className}> {
    return this.http.post<${className}>(this.apiUrl, ${modelVarName}).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Actualiza un registro existente
   */
  update(${modelVarName}: ${className}): Observable<${className}> {
    const url = \`\${this.apiUrl}/\${${modelVarName}.id}\`;
    return this.http.put<${className}>(url, ${modelVarName}).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Elimina un registro por su ID
   */
  delete(id: number | string): Observable<any> {
    const url = \`\${this.apiUrl}/\${id}\`;
    return this.http.delete<any>(url).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Manejo de errores HTTP
   */
  private handleError(error: any) {
    let errorMessage = '';
    if (error.error instanceof ErrorEvent) {
      // Error del cliente
      errorMessage = \`Error: \${error.error.message}\`;
    } else {
      // Error del servidor
      errorMessage = \`Código de error: \${error.status}\\nMensaje: \${error.message}\`;
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }`;
        
        // Añadir métodos CRUD al final de la clase
        enhancedService = enhancedService.substring(0, classEndIndex) + crudMethods + "\n}" + enhancedService.substring(classEndIndex + 1);
        
        return enhancedService;
    }
    
    /**
     * Actualiza las rutas para proyecto con componentes standalone
     */
    private async updateAppRoutesForStandalone(projectDir: string, components: Map<string, any>): Promise<void> {
        const appRoutesPath = path.join(projectDir, 'src', 'app', 'app.routes.ts');
        
        if (!fs.existsSync(appRoutesPath)) {
            // Si no existe el archivo de rutas, crearlo
            let routesContent = `import { Routes } from '@angular/router';\n\n`;
            
            // Importar componentes
            for (const [_, component] of components.entries()) {
                routesContent += `import { ${component.className} } from '${component.path}';\n`;
            }
            
            routesContent += `\nexport const routes: Routes = [\n`;
            
            // Crear rutas para cada componente
            const componentEntries = Array.from(components.entries());
            componentEntries.forEach(([origName, component], index) => {
                const path = component.name;
                routesContent += `  { path: '${path}', component: ${component.className} }${index < componentEntries.length - 1 ? ',' : ''}\n`;
            });
            
            // Añadir ruta por defecto si hay al menos un componente
            if (componentEntries.length > 0) {
                const [_, firstComponent] = componentEntries[0];
                routesContent += `,\n  { path: '', redirectTo: '${firstComponent.name}', pathMatch: 'full' },\n`;
                routesContent += `  { path: '**', redirectTo: '${firstComponent.name}' }\n`;
            }
            
            routesContent += `];\n`;
            
            fs.writeFileSync(appRoutesPath, routesContent);
            return;
        }
        
        // Si existe, actualizar el archivo de rutas
        let routesContent = fs.readFileSync(appRoutesPath, 'utf8');
        
        // Añadir importaciones de componentes
        let importsToAdd = '';
        for (const [_, component] of components.entries()) {
            const importStatement = `import { ${component.className} } from '${component.path}';`;
            if (!routesContent.includes(importStatement) && !routesContent.includes(component.className)) {
                importsToAdd += importStatement + '\n';
            }
        }
        
        if (importsToAdd) {
            // Añadir después de la última importación o al principio
            const lastImportIndex = routesContent.lastIndexOf('import ');
            const lastImportEndIndex = routesContent.indexOf(';', lastImportIndex) + 1;
            
            if (lastImportIndex !== -1) {
                routesContent = routesContent.substring(0, lastImportEndIndex) + '\n' + importsToAdd + routesContent.substring(lastImportEndIndex);
            } else {
                routesContent = importsToAdd + routesContent;
            }
        }
        
        // Añadir rutas para los componentes
        if (components.size > 0) {
            // Encontrar el array de rutas
            const routesArrayStartIndex = routesContent.indexOf('export const routes: Routes = [');
            if (routesArrayStartIndex !== -1) {
                const routesArrayEndIndex = routesContent.indexOf('];', routesArrayStartIndex);
                if (routesArrayEndIndex !== -1) {
                    // Extraer el contenido actual del array de rutas
                    const currentRoutesArray = routesContent.substring(routesArrayStartIndex + 30, routesArrayEndIndex).trim();
                    
                    // Preparar las nuevas rutas a añadir
                    let newRoutes = '';
                    for (const [_, component] of components.entries()) {
                        const routePath = `{ path: '${component.name}', component: ${component.className} }`;
                        if (!currentRoutesArray.includes(routePath)) {
                            newRoutes += `  ${routePath},\n`;
                        }
                    }
                    
                    // Añadir las nuevas rutas al array
                    if (newRoutes) {
                        const updatedRoutesArray = currentRoutesArray ? currentRoutesArray + ',\n' + newRoutes : newRoutes;
                        routesContent = routesContent.substring(0, routesArrayStartIndex + 30) + '\n' + updatedRoutesArray + routesContent.substring(routesArrayEndIndex);
                    }
                }
            }
        }
        
        fs.writeFileSync(appRoutesPath, routesContent);
    }
    
    /**
     * Actualiza el componente app con el contenido generado por la IA
     */
    private updateAppComponentWithAiGenerated(projectDir: string, appComponent: any, options: any): void {
        const appDir = path.join(projectDir, 'src', 'app');
        const styleExt = this.getStyleExtensionFromAngularJson(projectDir);
        
        // Actualizar HTML
        if (appComponent.html) {
            fs.writeFileSync(path.join(appDir, 'app.component.html'), appComponent.html);
        }
        
        // Actualizar TS
        if (appComponent.ts) {
            // Leer el archivo actual
            const currentAppTs = fs.existsSync(path.join(appDir, 'app.component.ts')) ? 
                fs.readFileSync(path.join(appDir, 'app.component.ts'), 'utf8') : '';
            
            // Fusionar con el contenido generado por la IA
            const mergedTs = currentAppTs ? 
                this.mergeComponentContent(currentAppTs, appComponent.ts) : 
                appComponent.ts;
                
            fs.writeFileSync(path.join(appDir, 'app.component.ts'), mergedTs);
        }
        
        // Actualizar CSS/SCSS
        if (appComponent.scss || appComponent.css) {
            fs.writeFileSync(
                path.join(appDir, `app.component.${styleExt}`),
                appComponent.scss || appComponent.css
            );
        }
    }
    
    /**
     * Verifica los componentes generados en busca de errores
     */
    private async verifyGeneratedComponents(projectDir: string, components: Map<string, any>): Promise<void> {
        // Verificar si hay errores de compilación en los componentes
        try {
            // Ejecutar una compilación en modo desarrollo para verificar errores
            this.logger.log('Verificando componentes generados con compilación...');
            await execAsync(`cd "${projectDir}" && npx ng build --configuration development`, { timeout: 60000 });
            this.logger.log('Verificación completada con éxito - No se encontraron errores');
        } catch (error) {
            // Si hay errores, intentar corregir los más comunes
            this.logger.warn(`Se encontraron posibles errores en la compilación: ${error.message}`);
            
            // Intentar corregir errores comunes
            for (const [origName, component] of components.entries()) {
                const componentTsPath = path.join(projectDir, 'src', 'app', component.path + '.ts');
                
                if (fs.existsSync(componentTsPath)) {
                    let tsContent = fs.readFileSync(componentTsPath, 'utf8');
                    
                    // Corregir problemas comunes
                    tsContent = this.fixCommonComponentErrors(tsContent);
                    
                    fs.writeFileSync(componentTsPath, tsContent);
                }
            }
        }
    }
    
    /**
     * Corrige errores comunes en componentes
     */
    private fixCommonComponentErrors(tsContent: string): string {
        let fixed = tsContent;
        
        // 1. Corregir uso de ngModel sin FormsModule
        if (fixed.includes('[(ngModel)]') && !fixed.includes('FormsModule')) {
            // Añadir FormsModule a imports
            if (fixed.includes('imports: [')) {
                fixed = fixed.replace(
                    /imports: \[([^\]]*)\]/,
                    (match, imports) => `imports: [${imports}${imports.trim().endsWith(',') ? '' : ','} FormsModule]`
                );
            } else if (fixed.includes('@Component')) {
                fixed = fixed.replace(
                    /@Component\(\{/,
                    '@Component({\n  imports: [FormsModule],'
                );
            }
            
            // Añadir importación de FormsModule
            if (!fixed.includes("import { FormsModule }")) {
                fixed = "import { FormsModule } from '@angular/forms';\n" + fixed;
            }
        }
        
        // 2. Corregir formGroup sin ReactiveFormsModule
        if ((fixed.includes('formGroup') || fixed.includes('FormGroup')) && !fixed.includes('ReactiveFormsModule')) {
            // Añadir ReactiveFormsModule a imports
            if (fixed.includes('imports: [')) {
                fixed = fixed.replace(
                    /imports: \[([^\]]*)\]/,
                    (match, imports) => `imports: [${imports}${imports.trim().endsWith(',') ? '' : ','} ReactiveFormsModule]`
                );
            } else if (fixed.includes('@Component')) {
                fixed = fixed.replace(
                    /@Component\(\{/,
                    '@Component({\n  imports: [ReactiveFormsModule],'
                );
            }
            
            // Añadir importación de ReactiveFormsModule
            if (!fixed.includes("import { ReactiveFormsModule }")) {
                fixed = "import { ReactiveFormsModule } from '@angular/forms';\n" + fixed;
            }
        }
        
        // 3. Corregir propiedades @Input sin inicializar
        fixed = fixed.replace(
            /@Input\(\)\s+(\w+)\s*:\s*string;/g,
            '@Input() $1: string = \'\';'
        );
        
        fixed = fixed.replace(
            /@Input\(\)\s+(\w+)\s*:\s*number;/g,
            '@Input() $1: number = 0;'
        );
        
        fixed = fixed.replace(
            /@Input\(\)\s+(\w+)\s*:\s*boolean;/g,
            '@Input() $1: boolean = false;'
        );
        
        // 4. Añadir implementación de OnInit si se usa ngOnInit pero no se implementa la interfaz
        if (fixed.includes('ngOnInit') && !fixed.includes('implements OnInit')) {
            fixed = fixed.replace(
                /export class (\w+)/,
                'export class $1 implements OnInit'
            );
            
            // Añadir importación de OnInit
            if (!fixed.includes("import { OnInit }")) {
                if (fixed.includes("import { Component")) {
                    fixed = fixed.replace(
                        /import { Component/,
                        'import { Component, OnInit'
                    );
                } else {
                    fixed = "import { OnInit } from '@angular/core';\n" + fixed;
                }
            }
        }
        
        // 5. Corregir directivas estructurales sin CommonModule
        if ((fixed.includes('*ngFor') || fixed.includes('*ngIf') || fixed.includes('[ngClass]')) && !fixed.includes('CommonModule')) {
            // Añadir CommonModule a imports
            if (fixed.includes('imports: [')) {
                fixed = fixed.replace(
                    /imports: \[([^\]]*)\]/,
                    (match, imports) => `imports: [${imports}${imports.trim().endsWith(',') ? '' : ','} CommonModule]`
                );
            } else if (fixed.includes('@Component')) {
                fixed = fixed.replace(
                    /@Component\(\{/,
                    '@Component({\n  imports: [CommonModule],'
                );
            }
            
            // Añadir importación de CommonModule
            if (!fixed.includes("import { CommonModule }")) {
                fixed = "import { CommonModule } from '@angular/common';\n" + fixed;
            }
        }
        
        return fixed;
    }
    

    /**
     * Organiza componentes en grupos por posible funcionalidad (basado en nombres)
     */
    private organizeComponentsByFeature(components: any): { [feature: string]: string[] } {
        const featureMap: { [feature: string]: string[] } = { 'core': [] };
        
        for (const componentName in components) {
            // Identificar posibles features basados en prefijos comunes
            // Ejemplo: user-profile, user-settings -> feature "user"
            const nameParts = componentName.split('-');
            if (nameParts.length > 1) {
                const possibleFeature = nameParts[0];
                
                // Si no existe la feature, crearla
                if (!featureMap[possibleFeature]) {
                    featureMap[possibleFeature] = [];
                }
                
                featureMap[possibleFeature].push(componentName);
            } else {
                // Si no tiene un prefijo claro, va a "core"
                featureMap['core'].push(componentName);
            }
        }
        
        // Eliminar features que solo tienen un componente para no sobre-modularizar
        const result: { [feature: string]: string[] } = {};
        for (const feature in featureMap) {
            if (featureMap[feature].length >= 2 || feature === 'core') {
                result[feature] = featureMap[feature];
            } else {
                // Si solo hay un componente, moverlo a "core"
                if (!result['core']) {
                    result['core'] = [];
                }
                result['core'] = result['core'].concat(featureMap[feature]);
            }
        }
        
        return result;
    }
    
    /**
     * Crea módulos de características (feature modules) para organizar mejor la aplicación
     */
    private async createFeatureModules(projectDir: string, componentsByFeature: { [feature: string]: string[] }, options: any): Promise<void> {
        const featuresDir = path.join(projectDir, 'src', 'app', 'features');
        
        // Crear directorio de features si no existe
        if (!fs.existsSync(featuresDir)) {
            fs.mkdirSync(featuresDir, { recursive: true });
        }
        
        for (const feature in componentsByFeature) {
            if (feature === 'core') continue; // No creamos un módulo específico para componentes core
            
            const components = componentsByFeature[feature];
            if (components.length === 0) continue;
            
            // Crear directorio para el feature
            const featureDir = path.join(featuresDir, feature);
            if (!fs.existsSync(featureDir)) {
                fs.mkdirSync(featureDir, { recursive: true });
            }
            
            // Crear el módulo para el feature
            const featureModuleContent = this.generateFeatureModule(feature, components, options.includeRouting);
            fs.writeFileSync(path.join(featureDir, `${feature}.module.ts`), featureModuleContent);
            
            // Si se incluye enrutamiento, crear un módulo de rutas para el feature
            if (options.includeRouting) {
                const featureRoutingModuleContent = this.generateFeatureRoutingModule(feature, components);
                fs.writeFileSync(path.join(featureDir, `${feature}-routing.module.ts`), featureRoutingModuleContent);
            }
        }
    }
    
    /**
     * Genera el contenido de un módulo de características (feature module)
     */
    private generateFeatureModule(feature: string, components: string[], includeRouting: boolean): string {
        const featureModuleName = feature.charAt(0).toUpperCase() + feature.slice(1) + 'Module';
        
        let imports = `import { NgModule } from '@angular/core';\nimport { CommonModule } from '@angular/common';\n`;
        
        // Importar módulo de rutas si es necesario
        if (includeRouting) {
            imports += `import { ${feature.charAt(0).toUpperCase() + feature.slice(1)}RoutingModule } from './${feature}-routing.module';\n`;
        }
        
        // Importar componentes
        for (const component of components) {
            const className = this.getComponentClassName(component);
            // Asumimos que los componentes se moverán a la carpeta del feature
            imports += `import { ${className} } from '../../components/${component}/${component}.component';\n`;
        }
        
        let moduleContent = `${imports}\n@NgModule({\n`;
        moduleContent += `  declarations: [\n    ${components.map(c => this.getComponentClassName(c)).join(',\n    ')}\n  ],\n`;
        
        moduleContent += `  imports: [\n    CommonModule,\n`;
        if (includeRouting) {
            moduleContent += `    ${feature.charAt(0).toUpperCase() + feature.slice(1)}RoutingModule,\n`;
        }
        moduleContent += `  ],\n`;
        
        // Exportar componentes para que estén disponibles fuera del módulo
        moduleContent += `  exports: [\n    ${components.map(c => this.getComponentClassName(c)).join(',\n    ')}\n  ]\n`;
        moduleContent += `})\nexport class ${featureModuleName} {}\n`;
        
        return moduleContent;
    }

    private getComponentClassName(componentName: string): string {
        // Convertir kebab-case a PascalCase y agregar 'Component' al final
        return componentName
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('') + 'Component';
    }

    private getServiceClassName(serviceName: string): string {
        // Convertir kebab-case a PascalCase y agregar 'Service' al final
        return serviceName
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('') + 'Service';
    }
    
    /**
     * Genera el contenido de un módulo de rutas para un feature
     */
    private generateFeatureRoutingModule(feature: string, components: string[]): string {
        const routingModuleName = feature.charAt(0).toUpperCase() + feature.slice(1) + 'RoutingModule';
        
        let imports = `import { NgModule } from '@angular/core';\n`;
        imports += `import { RouterModule, Routes } from '@angular/router';\n`;
        
        // Importar componentes
        for (const component of components) {
            const className = this.getComponentClassName(component);
            imports += `import { ${className} } from '../../components/${component}/${component}.component';\n`;
        }
        
        let routes = `const routes: Routes = [\n`;
        
        // Crear una ruta para cada componente
        components.forEach((component, index) => {
            const className = this.getComponentClassName(component);
            const path = component.replace(/^app-/, ''); // Eliminar prefijo app- si existe
            routes += `  { path: '${path}', component: ${className} }${index < components.length - 1 ? ',' : ''}\n`;
        });
        
        // Si hay al menos un componente, agregar una ruta por defecto
        if (components.length > 0) {
            const firstComponent = components[0];
            const path = firstComponent.replace(/^app-/, '');
            routes += `  { path: '', redirectTo: '${path}', pathMatch: 'full' }\n`;
        }
        
        routes += `];\n\n`;
        
        let moduleContent = `${imports}\n${routes}@NgModule({\n`;
        moduleContent += `  imports: [RouterModule.forChild(routes)],\n`;
        moduleContent += `  exports: [RouterModule]\n`;
        moduleContent += `})\nexport class ${routingModuleName} {}\n`;
        
        return moduleContent;
    }
    
    /**
     * Actualiza el módulo principal para incluir los feature modules
     */
    private async updateAppModule(projectDir: string, generatedComponents: any, componentsByFeature: { [feature: string]: string[] }): Promise<void> {
        const appModulePath = path.join(projectDir, 'src', 'app', 'app.module.ts');
        
        if (!fs.existsSync(appModulePath)) {
            this.logger.warn('No se encontró app.module.ts');
            return;
        }
        
        let appModule = fs.readFileSync(appModulePath, 'utf8');
        
        // Recopilar módulos de features a importar
        const featureModuleImports = [];
        const featureModuleDeclarations = [];
        
        for (const feature in componentsByFeature) {
            if (feature === 'core' || componentsByFeature[feature].length === 0) continue;
            
            const moduleName = feature.charAt(0).toUpperCase() + feature.slice(1) + 'Module';
            featureModuleImports.push(`import { ${moduleName} } from './features/${feature}/${feature}.module';`);
            featureModuleDeclarations.push(moduleName);
        }
        
        // Recopilar componentes core para importar directamente
        const coreComponentImports = [];
        const coreComponentDeclarations = [];
        
        if (componentsByFeature['core'] && componentsByFeature['core'].length > 0) {
            for (const componentName of componentsByFeature['core']) {
                const className = this.getComponentClassName(componentName);
                coreComponentImports.push(`import { ${className} } from './components/${componentName}/${componentName}.component';`);
                coreComponentDeclarations.push(className);
            }
        }
        
        // Agregar importaciones al principio del archivo
        let importStatements = '';
        if (featureModuleImports.length > 0) {
            importStatements += featureModuleImports.join('\n') + '\n';
        }
        if (coreComponentImports.length > 0) {
            importStatements += coreComponentImports.join('\n') + '\n';
        }
        
        if (importStatements) {
            appModule = appModule.replace(
                'import { NgModule } from \'@angular/core\';',
                'import { NgModule } from \'@angular/core\';\n' + importStatements
            );
        }
        
        // Agregar módulos de features al array imports
        if (featureModuleDeclarations.length > 0) {
            appModule = appModule.replace(
                /imports: \[([\s\S]*?)\]/,
                `imports: [$1,\n    ${featureModuleDeclarations.join(',\n    ')}\n  ]`
            );
        }
        
        // Agregar componentes core al array declarations
        if (coreComponentDeclarations.length > 0) {
            appModule = appModule.replace(
                /declarations: \[([\s\S]*?)\]/,
                `declarations: [$1${coreComponentDeclarations.length > 0 ? ',\n    ' + coreComponentDeclarations.join(',\n    ') : ''}\n  ]`
            );
        }
        
        // Agregar importaciones de servicios si existen
        if (generatedComponents.services) {
            const serviceImports = [];
            const serviceProviders = [];
            
            for (const serviceName in generatedComponents.services) {
                const className = this.getServiceClassName(serviceName);
                serviceImports.push(`import { ${className} } from './services/${serviceName}.service';`);
                serviceProviders.push(className);
            }
            
            if (serviceImports.length > 0) {
                appModule = appModule.replace(
                    'import { NgModule } from \'@angular/core\';',
                    'import { NgModule } from \'@angular/core\';\n' + serviceImports.join('\n')
                );
            }
            
            if (serviceProviders.length > 0) {
                appModule = appModule.replace(
                    /providers: \[([\s\S]*?)\]/,
                    `providers: [$1${serviceProviders.length > 0 ? ',\n    ' + serviceProviders.join(',\n    ') : ''}\n  ]`
                );
            }
        }
        
        fs.writeFileSync(appModulePath, appModule);
    }
    
    /**
     * Verifica y corrige los selectores de los componentes
     */
    private async verifyComponentSelectors(projectDir: string, components: any): Promise<void> {
        for (const componentName in components) {
            const component = components[componentName];
            const componentDir = path.join(projectDir, 'src', 'app', 'components', componentName);
            const componentTsPath = path.join(componentDir, `${componentName}.component.ts`);
            
            if (!fs.existsSync(componentTsPath) || !component.ts) {
                continue;
            }
            
            let componentTs = component.ts;
            
            // Verificar que el selector contenga el nombre del componente
            if (!componentTs.includes(`selector: '${componentName}'`) && !componentTs.includes(`selector: "app-${componentName}"`)) {
                // Corregir el selector para que use una convención estándar
                componentTs = componentTs.replace(
                    /selector: ['"].*?['"],/,
                    `selector: 'app-${componentName}',`
                );
                
                // Si no hay un selector, añadirlo
                if (!componentTs.includes('selector:')) {
                    componentTs = componentTs.replace(
                        /@Component\(\{/,
                        `@Component({\n  selector: 'app-${componentName}',`
                    );
                }
                
                // Escribir los cambios
                fs.writeFileSync(componentTsPath, componentTs);
            }
        }
    }
    
    /**
     * Actualiza la configuración de la aplicación para rutas (Angular 19+)
     */
    private async updateAppConfig(projectDir: string, options: any): Promise<void> {
        const appConfigPath = path.join(projectDir, 'src', 'app', 'app.config.ts');
        
        if (!fs.existsSync(appConfigPath)) {
            this.logger.warn('No se encontró app.config.ts');
            return;
        }
        
        let appConfig = fs.readFileSync(appConfigPath, 'utf8');
        
        // Asegurar que provideRouter esté correctamente importado y configurado
        if (!appConfig.includes('provideRouter(routes)')) {
            // Si no incluye la configuración de rutas, añadirla
            const routesImport = "import { routes } from './app.routes';";
            if (!appConfig.includes(routesImport)) {
                appConfig = appConfig.replace(
                    /import {.*?} from '@angular\/core';/,
                    `$&\nimport { provideRouter } from '@angular/router';\n${routesImport}`
                );
            }
            
            // Añadir provideRouter a los providers
            appConfig = appConfig.replace(
                /providers: \[([\s\S]*?)\]/,
                `providers: [$1, provideRouter(routes)]`
            );
        }
        
        fs.writeFileSync(appConfigPath, appConfig);
    }
    
    /**
     * Mejora la estructura de carpetas para los componentes generados
     */
    private async addComponentsToProject(projectDir: string, components: any): Promise<void> {
        const componentsDir = path.join(projectDir, 'src', 'app', 'components');
        const isAngular19Plus = this.determineAngularVersion() >= 19;
        
        if (!fs.existsSync(componentsDir)) {
            fs.mkdirSync(componentsDir, { recursive: true });
        }
        
        for (const componentName in components) {
            const component = components[componentName];
            const componentDir = path.join(componentsDir, componentName);
            
            if (!fs.existsSync(componentDir)) {
                fs.mkdirSync(componentDir, { recursive: true });
            }
            
            // Para Angular 19+, asegurarse de que los componentes sean standalone
            if (component.ts && isAngular19Plus) {
                let componentTs = component.ts;
                
                // Asegurar que el selector sea consistente con el nombre del componente
                if (!componentTs.includes(`selector: '${componentName}'`) && !componentTs.includes(`selector: "app-${componentName}"`)) {
                    componentTs = componentTs.replace(
                        /selector: ['"].*?['"],/,
                        `selector: 'app-${componentName}',`
                    );
                    
                    if (!componentTs.includes('selector:')) {
                        componentTs = componentTs.replace(
                            /@Component\(\{/,
                            `@Component({\n  selector: 'app-${componentName}',`
                        );
                    }
                }
                
                // Comprobar si ya es standalone
                if (!componentTs.includes('standalone: true')) {
                    // Añadir standalone: true
                    componentTs = componentTs.replace(
                        /@Component\(\{/,
                        '@Component({\n  standalone: true,'
                    );
                }
                
                // Asegurarse de que tenga las importaciones correctas
                if (!componentTs.includes('imports: [')) {
                    componentTs = componentTs.replace(
                        /@Component\(\{/,
                        '@Component({\n  imports: [CommonModule],'
                    );
                    
                    // Añadir la importación de CommonModule si no existe
                    if (!componentTs.includes('import { CommonModule }')) {
                        componentTs = componentTs.replace(
                            /import { Component.+?;/,
                            'import { Component } from \'@angular/core\';\nimport { CommonModule } from \'@angular/common\';'
                        );
                    }
                }
                
                fs.writeFileSync(path.join(componentDir, `${componentName}.component.ts`), componentTs);
            } else if (component.ts) {
                // Para versiones anteriores de Angular, asegurar que el selector sea consistente
                let componentTs = component.ts;
                
                // Corregir el selector si no es consistente
                if (!componentTs.includes(`selector: '${componentName}'`) && !componentTs.includes(`selector: "app-${componentName}"`)) {
                    componentTs = componentTs.replace(
                        /selector: ['"].*?['"],/,
                        `selector: 'app-${componentName}',`
                    );
                    
                    if (!componentTs.includes('selector:')) {
                        componentTs = componentTs.replace(
                            /@Component\(\{/,
                            `@Component({\n  selector: 'app-${componentName}',`
                        );
                    }
                }
                
                fs.writeFileSync(path.join(componentDir, `${componentName}.component.ts`), componentTs);
            }
            
            if (component.html) {
                fs.writeFileSync(path.join(componentDir, `${componentName}.component.html`), component.html);
            }
            
            // Manejar diferentes extensiones de estilo (scss, css)
            const styleExt = fs.existsSync(path.join(projectDir, 'angular.json')) ? 
                this.getStyleExtensionFromAngularJson(projectDir) : 'scss';
            
            if (component.scss || component.css) {
                fs.writeFileSync(
                    path.join(componentDir, `${componentName}.component.${styleExt}`), 
                    component.scss || component.css
                );
            }
        }
    }
    
    private getStyleExtensionFromAngularJson(projectDir: string): string {
        try {
            const angularJson = JSON.parse(fs.readFileSync(path.join(projectDir, 'angular.json'), 'utf8'));
            const projectName = Object.keys(angularJson.projects)[0];
            const schematics = angularJson.projects[projectName]?.schematics;
            
            if (schematics && schematics['@schematics/angular:component'] && schematics['@schematics/angular:component'].style) {
                return schematics['@schematics/angular:component'].style;
            }
            
            return 'scss'; // Por defecto
        } catch (error) {
            return 'scss'; // Por defecto
        }
    }
    
    private async addServicesToProject(projectDir: string, services: any): Promise<void> {
        const servicesDir = path.join(projectDir, 'src', 'app', 'services');
        
        if (!fs.existsSync(servicesDir)) {
            fs.mkdirSync(servicesDir, { recursive: true });
        }
        
        for (const serviceName in services) {
            fs.writeFileSync(path.join(servicesDir, `${serviceName}.service.ts`), services[serviceName]);
        }
    }
    
    private async addModelsToProject(projectDir: string, models: any): Promise<void> {
        const modelsDir = path.join(projectDir, 'src', 'app', 'models');
        
        if (!fs.existsSync(modelsDir)) {
            fs.mkdirSync(modelsDir, { recursive: true });
        }
        
        for (const modelName in models) {
            fs.writeFileSync(path.join(modelsDir, `${modelName}.model.ts`), models[modelName]);
        }
    }
    
    private async updateRoutingModule(projectDir: string, generatedComponents: any): Promise<void> {
        try {
            // Angular 19+ siempre usa app.routes.ts
            const isAngular19Plus = this.determineAngularVersion() >= 19;
            const isStandaloneRouting = isAngular19Plus || fs.existsSync(path.join(projectDir, 'src', 'app', 'app.routes.ts'));
            const routingPath = isStandaloneRouting 
                ? path.join(projectDir, 'src', 'app', 'app.routes.ts')
                : path.join(projectDir, 'src', 'app', 'app-routing.module.ts');
            
            // Si no existe módulo de routing o no tenemos componentes, no hacer nada
            if (!fs.existsSync(routingPath) || !generatedComponents.components) {
                this.logger.warn('No se encontró el archivo de rutas o no hay componentes para enrutar');
                return;
            }
            
            // Si la IA generó un módulo de rutas específico, adaptarlo al tipo de proyecto
            if (generatedComponents.routing) {
                let routingContent = generatedComponents.routing;
                
                // Para Angular 19+, asegurarse de que usamos el formato correcto
                if (isAngular19Plus) {
                    // Asegurarnos de que estamos usando Routes y export const routes
                    if (!routingContent.includes('export const routes: Routes')) {
                        // Extraer las rutas
                        let routesContent = "";
                        const routesMatch = routingContent.match(/const routes: Routes = \[([\s\S]*?)\];/) || 
                                           routingContent.match(/export const routes: Routes = \[([\s\S]*?)\];/);
                        
                        if (routesMatch) {
                            routesContent = routesMatch[1];
                        }
                        
                        // Recrear el archivo de rutas
                        routingContent = `import { Routes } from '@angular/router';\n\n`;
                        
                        // Agregar importaciones de componentes
                        for (const componentName in generatedComponents.components) {
                            const className = this.getComponentClassName(componentName);
                            routingContent += `import { ${className} } from './components/${componentName}/${componentName}.component';\n`;
                        }
                        
                        routingContent += `\nexport const routes: Routes = [\n${routesContent}\n];\n`;
                    }
                } else if (!isStandaloneRouting && !routingContent.includes('@NgModule')) {
                    // Convertir formato standalone a módulo para Angular tradicional
                    const routesMatch = routingContent.match(/export const routes: Routes = \[([\s\S]*?)\];/);
                    if (routesMatch) {
                        routingContent = `import { NgModule } from '@angular/core';\n`;
                        routingContent += `import { RouterModule, Routes } from '@angular/router';\n\n`;
                        
                        // Agregar importaciones de componentes
                        for (const componentName in generatedComponents.components) {
                            const className = this.getComponentClassName(componentName);
                            routingContent += `import { ${className} } from './components/${componentName}/${componentName}.component';\n`;
                        }
                        
                        routingContent += `\nconst routes: Routes = [${routesMatch[1]}];\n\n`;
                        routingContent += `@NgModule({\n`;
                        routingContent += `  imports: [RouterModule.forRoot(routes)],\n`;
                        routingContent += `  exports: [RouterModule]\n`;
                        routingContent += `})\n`;
                        routingContent += `export class AppRoutingModule { }`;
                    }
                }
                
                fs.writeFileSync(routingPath, routingContent);
                this.logger.log('Módulo de rutas actualizado con el generado por la IA y adaptado al tipo de proyecto');
                return;
            }
            
            // En caso contrario, generar rutas automáticamente para cada componente
            const componentImports = [];
            const routes = [];
            
            for (const componentName in generatedComponents.components) {
                const className = this.getComponentClassName(componentName);
                componentImports.push(`import { ${className} } from './components/${componentName}/${componentName}.component';`);
                
                // Crear una ruta para cada componente usando su nombre
                const routePath = componentName.replace(/^app-/, ''); // Eliminar prefijo "app-" si existe
                routes.push(`  { path: '${routePath}', component: ${className} }`);
            }
            
            // Agregar ruta por defecto si hay al menos un componente
            if (routes.length > 0) {
                const firstComponentName = Object.keys(generatedComponents.components)[0];
                const defaultRoute = firstComponentName.replace(/^app-/, '');
                routes.push(`  { path: '', redirectTo: '${defaultRoute}', pathMatch: 'full' }`);
            }
            
            if (isStandaloneRouting || isAngular19Plus) {
                // Formato para app.routes.ts (Angular 14+ o 19+)
                let newRoutingModule = `import { Routes } from '@angular/router';\n`;
                
                // Agregar importaciones de componentes
                if (componentImports.length > 0) {
                    newRoutingModule += `\n${componentImports.join('\n')}\n`;
                }
                
                // Definir las rutas
                newRoutingModule += `\nexport const routes: Routes = [\n${routes.join(',\n')}\n];\n`;
                
                fs.writeFileSync(routingPath, newRoutingModule);
            } else {
                // Formato para app-routing.module.ts (Angular tradicional)
                let routingModule = fs.readFileSync(routingPath, 'utf8');
                
                // Agregar importaciones de componentes
                if (componentImports.length > 0) {
                    routingModule = routingModule.replace(
                        'import { NgModule } from \'@angular/core\';',
                        'import { NgModule } from \'@angular/core\';\n' + componentImports.join('\n')
                    );
                }
                
                // Actualizar array de rutas
                if (routes.length > 0) {
                    routingModule = routingModule.replace(
                        /const routes: Routes = \[([\s\S]*?)\];/,
                        `const routes: Routes = [\n${routes.join(',\n')}\n];`
                    );
                }
                
                fs.writeFileSync(routingPath, routingModule);
            }
            
            this.logger.log('Módulo de rutas actualizado automáticamente');
        } catch (error) {
            this.logger.error('Error al actualizar el módulo de rutas:', error);
            throw new Error('Error al actualizar el módulo de rutas: ' + error.message);
        }
    }
    
    private async updateAppComponent(projectDir: string, generatedComponents: any, options: any): Promise<void> {
        try {
            const appDir = path.join(projectDir, 'src', 'app');
            const styleExt = this.getStyleExtensionFromAngularJson(projectDir);
            
            // Detectar si estamos usando componentes standalone (Angular 14+ nuevo estilo) o módulos
            const isStandaloneComponent = this.isUsingStandaloneComponents(projectDir);
            this.logger.log(`Detectado uso de componentes ${isStandaloneComponent ? 'standalone' : 'basados en módulos'}`);
            
            // Actualizar app.component.html para incluir los componentes o mostrar el router-outlet
            const appComponentHtmlPath = path.join(appDir, 'app.component.html');
            const hasRouter = options.includeRouting;
            const componentsList = Object.keys(generatedComponents.components || {});
            
            // Si la IA generó un app.component específico, usarlo
            if (generatedComponents.appComponent) {
                if (generatedComponents.appComponent.html) {
                    fs.writeFileSync(appComponentHtmlPath, generatedComponents.appComponent.html);
                }
                
                if (generatedComponents.appComponent.ts) {
                    const modifiedTs = this.adaptComponentTsToProjectStructure(
                        generatedComponents.appComponent.ts, 
                        isStandaloneComponent,
                        componentsList
                    );
                    fs.writeFileSync(path.join(appDir, 'app.component.ts'), modifiedTs);
                }
                
                if (generatedComponents.appComponent.scss || generatedComponents.appComponent.css) {
                    fs.writeFileSync(
                        path.join(appDir, `app.component.${styleExt}`),
                        generatedComponents.appComponent.scss || generatedComponents.appComponent.css
                    );
                }
                
                return;
            }
            
            // En caso contrario, generar un template básico que incorpore los componentes
            let appComponentHtml = '';
            
            // Header con el nombre del proyecto
            appComponentHtml += `<div class="app-container">
  <header class="app-header">
    <h1>${options.name || 'Aplicación Angular'}</h1>
    `;
            
            // Agregar navegación si hay rutas
            if (hasRouter && componentsList.length > 0) {
                appComponentHtml += `
    <nav class="app-nav">
      <ul>`;
                
                for (const componentName of componentsList) {
                    const routePath = componentName.replace(/^app-/, '');
                    const displayName = componentName
                        .replace(/^app-/, '')
                        .split('-')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                    
                    appComponentHtml += `
        <li><a routerLink="/${routePath}" routerLinkActive="active">${displayName}</a></li>`;
                }
                
                appComponentHtml += `
      </ul>
    </nav>`;
            }
            
            appComponentHtml += `
  </header>

  <main class="app-content">`;
            
            // Agregar router-outlet si hay rutas, o los componentes directamente si no hay
            if (hasRouter) {
                appComponentHtml += `
    <router-outlet></router-outlet>`;
            } else if (componentsList.length > 0) {
                // Si no hay router, mostrar todos los componentes directamente
                for (const componentName of componentsList) {
                    appComponentHtml += `
    <${componentName}></${componentName}>`;
                }
            } else {
                // Si no hay componentes ni router, mostrar un mensaje de bienvenida
                appComponentHtml += `
    <div class="welcome-message">
      <h2>Bienvenido a tu aplicación Angular</h2>
      <p>Este proyecto fue generado usando Collaborative Project.</p>
    </div>`;
            }
            
            appComponentHtml += `
  </main>

  <footer class="app-footer">
    <p>&copy; ${new Date().getFullYear()} - ${options.name || 'Aplicación Angular'}</p>
  </footer>
</div>`;
            
            // Escribir el HTML generado
            fs.writeFileSync(appComponentHtmlPath, appComponentHtml);
            
            // Actualizar estilos
            const appComponentStylePath = path.join(appDir, `app.component.${styleExt}`);
            const styles = `
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  background-color: #3f51b5;
  color: white;
  padding: 1rem;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

.app-header h1 {
  margin: 0;
  font-size: 1.8rem;
}

.app-nav ul {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 1rem 0 0 0;
}

.app-nav li {
  margin-right: 1rem;
}

.app-nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.app-nav a:hover, .app-nav a.active {
  background-color: rgba(255, 255, 255, 0.2);
}

.app-content {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.welcome-message {
  text-align: center;
  padding: 2rem;
  border-radius: 8px;
  background-color: #f5f5f5;
}

.app-footer {
  background-color: #f5f5f5;
  color: #555;
  text-align: center;
  padding: 1rem;
  margin-top: 2rem;
}
`;
            fs.writeFileSync(appComponentStylePath, styles);
            
            // Actualizar el archivo TypeScript del componente
            this.updateAppComponentTs(appDir, componentsList, isStandaloneComponent, options);
            
            this.logger.log('app.component actualizado correctamente');
        } catch (error) {
            this.logger.error('Error al actualizar app.component:', error);
            throw new Error('Error al actualizar app.component: ' + error.message);
        }
    }
    
    /**
     * Determina si el proyecto Angular está usando componentes standalone o módulos
     * En Angular 19+, siempre usa componentes standalone
     */
    private isUsingStandaloneComponents(projectDir: string): boolean {
        try {
            // Verificar versión de Angular en package.json
            const packageJsonPath = path.join(projectDir, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                // Angular 19+ siempre utiliza componentes standalone
                if (packageJson.dependencies && packageJson.dependencies['@angular/core'] && 
                    packageJson.dependencies['@angular/core'].includes('19.')) {
                    this.logger.log('Detectado Angular 19+, usando componentes standalone');
                    return true;
                }
            }
            
            // Para otras versiones, usar la detección normal
            const appComponentPath = path.join(projectDir, 'src', 'app', 'app.component.ts');
            
            if (fs.existsSync(appComponentPath)) {
                const content = fs.readFileSync(appComponentPath, 'utf8');
                
                // Si contiene standalone: true, es un componente standalone
                if (content.includes('standalone: true')) {
                    return true;
                }
                
                // Si se importa el ApplicationConfig, probablemente usa el nuevo sistema
                const appConfigPath = path.join(projectDir, 'src', 'app', 'app.config.ts');
                if (fs.existsSync(appConfigPath)) {
                    return true;
                }
            }
            
            // Si existe app.routes.ts en lugar de app-routing.module.ts, probablemente usa standalone
            const appRoutesPath = path.join(projectDir, 'src', 'app', 'app.routes.ts');
            if (fs.existsSync(appRoutesPath)) {
                return true;
            }
            
            return false;
        } catch (error) {
            this.logger.error('Error al determinar el tipo de componentes:', error);
            return false; // Por defecto, asumimos componentes tradicionales
        }
    }
    
    /**
     * Adapta el código TypeScript del componente para Angular 19+
     */
    private adaptComponentTsToProjectStructure(componentTs: string, isStandalone: boolean, componentsList: string[]): string {
        if (!isStandalone) {
            // Para proyectos basados en módulos, no necesitamos modificaciones mayores
            return componentTs;
        }
        
        // Para proyectos con componentes standalone, necesitamos modificar el decorador @Component
        let modified = componentTs;
        
        // Verificar si tenemos la estructura Angular 19+ (imports en el @Component)
        const isAngular19Plus = modified.includes('imports: [') || this.determineAngularVersion() >= 19;
        
        // Asegurarnos de que tenga la propiedad standalone: true
        if (!modified.includes('standalone: true')) {
            modified = modified.replace(
                /@Component\(\{/,
                '@Component({\n  standalone: true,'
            );
        }
        
        // Agregar imports para los componentes hijos si no están ya
        if (componentsList.length > 0 && !modified.includes('imports: [')) {
            let imports = 'RouterOutlet, CommonModule';
            
            // Agregar todos los componentes a los imports
            for (const componentName of componentsList) {
                const className = this.getComponentClassName(componentName);
                imports += `, ${className}`;
            }
            
            modified = modified.replace(
                /@Component\(\{/,
                `@Component({\n  imports: [${imports}],`
            );
            
            // Agregar las importaciones necesarias al inicio del archivo
            let importStatements = 'import { Component } from \'@angular/core\';\n' +
                                  'import { RouterOutlet } from \'@angular/router\';\n' +
                                  'import { CommonModule } from \'@angular/common\';\n';
                                  
            for (const componentName of componentsList) {
                const className = this.getComponentClassName(componentName);
                importStatements += `import { ${className} } from './components/${componentName}/${componentName}.component';\n`;
            }
            
            // Reemplazar la declaración de importación existente
            modified = modified.replace(
                /import.*?;(\n|$)/,
                importStatements
            );
        }
        
        return modified;
    }
    
    /**
     * Determina la versión de Angular del proyecto actual
     */
    private determineAngularVersion(): number {
        try {
            // Intentamos leer la versión de package.json
            const packageJsonPath = path.join(process.cwd(), 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                if (packageJson.dependencies && packageJson.dependencies['@angular/core']) {
                    const versionString = packageJson.dependencies['@angular/core'];
                    // Extraer el número de versión principal (ej: de "^19.2.0" obtener "19")
                    const versionMatch = versionString.match(/\^?(\d+)\./);
                    if (versionMatch && versionMatch[1]) {
                        return parseInt(versionMatch[1], 10);
                    }
                }
            }
            return 0; // No pudimos determinar la versión
        } catch (error) {
            return 0; // Error al leer el archivo
        }
    }
    
    /**
     * Actualiza el archivo app.component.ts adaptándolo al tipo de proyecto
     */
    private updateAppComponentTs(appDir: string, componentsList: string[], isStandalone: boolean, options: any): void {
        const appComponentTsPath = path.join(appDir, 'app.component.ts');
        
        if (!fs.existsSync(appComponentTsPath)) {
            this.logger.warn('No se encontró app.component.ts');
            return;
        }
        
        let appComponentTs = fs.readFileSync(appComponentTsPath, 'utf8');
        const isAngular19Plus = appComponentTs.includes('imports:') || this.determineAngularVersion() >= 19;
        
        // Actualizar el título de la aplicación
        appComponentTs = appComponentTs.replace(
            /title = .*?;/,
            `title = '${options.name || 'Aplicación Angular'}';`
        );
        
        if (isStandalone) {
            // Para Angular 19+, necesitamos un enfoque específico ya que todos los componentes son standalone
            if (isAngular19Plus) {
                // Crear una versión completamente nueva del archivo
                let newAppComponentTs = `import { Component } from '@angular/core';\n`;
                newAppComponentTs += `import { RouterOutlet } from '@angular/router';\n`;
                newAppComponentTs += `import { CommonModule } from '@angular/common';\n`;
                
                // Importar los componentes
                for (const componentName of componentsList) {
                    const className = this.getComponentClassName(componentName);
                    newAppComponentTs += `import { ${className} } from './components/${componentName}/${componentName}.component';\n`;
                }
                
                newAppComponentTs += `\n@Component({\n`;
                newAppComponentTs += `  selector: 'app-root',\n`;
                newAppComponentTs += `  standalone: true,\n`;
                
                // Definir los imports
                newAppComponentTs += `  imports: [RouterOutlet, CommonModule`;
                for (const componentName of componentsList) {
                    const className = this.getComponentClassName(componentName);
                    newAppComponentTs += `, ${className}`;
                }
                newAppComponentTs += `],\n`;
                
                // Continuar con el resto del componente
                newAppComponentTs += `  templateUrl: './app.component.html',\n`;
                newAppComponentTs += `  styleUrls: ['./app.component.scss']\n`;
                newAppComponentTs += `})\n`;
                newAppComponentTs += `export class AppComponent {\n`;
                newAppComponentTs += `  title = '${options.name || 'Aplicación Angular'}';\n`;
                newAppComponentTs += `}\n`;
                
                // Reemplazar todo el contenido
                fs.writeFileSync(appComponentTsPath, newAppComponentTs);
                return;
            }
            
            // Para componentes standalone de versiones anteriores a Angular 19
            if (componentsList.length > 0) {
                // Verificar si ya tiene importaciones
                const hasImports = appComponentTs.includes('imports: [');
                
                if (!hasImports) {
                    // Agregar importaciones para los componentes
                    appComponentTs = appComponentTs.replace(
                        /@Component\(\{/,
                        '@Component({\n  standalone: true,\n  imports: [RouterOutlet, CommonModule' + 
                        componentsList.map(name => `, ${this.getComponentClassName(name)}`).join('') + 
                        '],'
                    );
                    
                    // Agregar las importaciones en la parte superior
                    let importStatements = 'import { Component } from \'@angular/core\';\n' +
                                          'import { RouterOutlet } from \'@angular/router\';\n' +
                                          'import { CommonModule } from \'@angular/common\';\n';
                    
                    for (const componentName of componentsList) {
                        const className = this.getComponentClassName(componentName);
                        importStatements += `import { ${className} } from './components/${componentName}/${componentName}.component';\n`;
                    }
                    
                    // Reemplazar la declaración de importación existente
                    appComponentTs = appComponentTs.replace(
                        /import.*?;(\n|$)/,
                        importStatements
                    );
                } else {
                    // Si ya tiene imports, asegurarse de que incluya RouterOutlet y CommonModule
                    if (!appComponentTs.includes('RouterOutlet')) {
                        appComponentTs = appComponentTs.replace(
                            /imports: \[/,
                            'imports: [RouterOutlet, '
                        );
                        
                        // Agregar la importación si no está
                        if (!appComponentTs.includes('import { RouterOutlet }')) {
                            appComponentTs = 'import { RouterOutlet } from \'@angular/router\';\n' + appComponentTs;
                        }
                    }
                    
                    if (!appComponentTs.includes('CommonModule')) {
                        appComponentTs = appComponentTs.replace(
                            /imports: \[/,
                            'imports: [CommonModule, '
                        );
                        
                        // Agregar la importación si no está
                        if (!appComponentTs.includes('import { CommonModule }')) {
                            appComponentTs = 'import { CommonModule } from \'@angular/common\';\n' + appComponentTs;
                        }
                    }
                    
                    // Agregar los componentes a los imports
                    for (const componentName of componentsList) {
                        const className = this.getComponentClassName(componentName);
                        
                        if (!appComponentTs.includes(className)) {
                            appComponentTs = appComponentTs.replace(
                                /imports: \[/,
                                `imports: [${className}, `
                            );
                            
                            // Agregar la importación si no está
                            if (!appComponentTs.includes(`import { ${className} }`)) {
                                appComponentTs = `import { ${className} } from './components/${componentName}/${componentName}.component';\n` + appComponentTs;
                            }
                        }
                    }
                }
                
                fs.writeFileSync(appComponentTsPath, appComponentTs);
            }
        }
    }
    
    private async zipProject(projectDir: string): Promise<Buffer> {
        this.logger.log(`Comprimiendo proyecto en ${projectDir}...`);
        
        const zip = new JSZip();
        
        // Función recursiva para agregar archivos al ZIP
        const addFilesToZip = (currentPath: string, zipFolder: JSZip) => {
            const files = fs.readdirSync(currentPath);
            
            for (const file of files) {
                const filePath = path.join(currentPath, file);
                const relativePath = path.relative(projectDir, filePath);
                
                if (fs.statSync(filePath).isDirectory()) {
                    // Si es un directorio, crear carpeta en ZIP y procesar recursivamente
                    const newZipFolder = zipFolder.folder(file);
                    addFilesToZip(filePath, newZipFolder);
                } else {
                    // Si es un archivo, agregarlo al ZIP
                    const fileContent = fs.readFileSync(filePath);
                    zipFolder.file(file, fileContent);
                }
            }
        };
        
        // Agregar todos los archivos al ZIP
        addFilesToZip(projectDir, zip);
        
        // Generar el buffer del ZIP
        return await zip.generateAsync({
            type: "nodebuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
            platform: "UNIX",
            comment: "Proyecto Angular generado por Collaborative Project"
        });
    }
    

    /**
     * Usa el Angular CLI para generar componentes
     */
    private async generateComponentWithCLI(projectDir: string, componentName: string, options: any): Promise<void> {
        try {
            const sanitizedName = componentName.replace(/^app-/, ''); // Eliminar prefijo app- si existe
            
            let command = `cd "${projectDir}" && npx ng generate component ${sanitizedName} --skip-tests`;
            
            // Aplicar opciones según la versión y configuración
            if (this.determineAngularVersion() >= 19) {
                command += ` --standalone`;
            }
            
            if (options.cssFramework === 'scss' || options.cssFramework === 'sass') {
                command += ` --style=scss`;
            } else if (options.cssFramework === 'less') {
                command += ` --style=less`;
            } else {
                command += ` --style=css`;
            }
            
            this.logger.log(`Generando componente ${sanitizedName} con Angular CLI...`);
            const { stdout } = await execAsync(command);
            this.logger.log(`Componente generado: ${stdout}`);
            
            return;
        } catch (error) {
            this.logger.error(`Error generando componente con CLI: ${error.message}`);
            throw new Error(`Error al generar componente con Angular CLI: ${error.message}`);
        }
    }

    /**
     * Usa el Angular CLI para generar servicios
     */
    private async generateServiceWithCLI(projectDir: string, serviceName: string): Promise<void> {
        try {
            const sanitizedName = serviceName.replace(/Service$/, '').toLowerCase(); // Normalizar nombre
            
            const command = `cd "${projectDir}" && npx ng generate service services/${sanitizedName} --skip-tests`;
            
            this.logger.log(`Generando servicio ${sanitizedName} con Angular CLI...`);
            const { stdout } = await execAsync(command);
            this.logger.log(`Servicio generado: ${stdout}`);
            
            return;
        } catch (error) {
            this.logger.error(`Error generando servicio con CLI: ${error.message}`);
            throw new Error(`Error al generar servicio con Angular CLI: ${error.message}`);
        }
    }

    /**
     * Genera servicios CRUD para los modelos detectados
     */
    private async generateCrudServices(projectDir: string, models: any): Promise<any> {
        const servicesDir = path.join(projectDir, 'src', 'app', 'services');
        
        if (!fs.existsSync(servicesDir)) {
            fs.mkdirSync(servicesDir, { recursive: true });
        }
        
        const generatedServices = {};
        
        for (const modelName in models) {
            const serviceName = `${modelName.toLowerCase()}.service`;
            const className = modelName.charAt(0).toUpperCase() + modelName.slice(1) + 'Service';
            
            // Generar servicio CRUD completo para este modelo
            const serviceContent = this.generateCrudServiceForModel(modelName, models[modelName]);
            
            // Guardar el servicio generado
            const servicePath = path.join(servicesDir, serviceName + '.ts');
            fs.writeFileSync(servicePath, serviceContent);
            
            generatedServices[serviceName] = serviceContent;
            
            this.logger.log(`Servicio CRUD generado para modelo ${modelName}`);
        }
        
        return generatedServices;
    }
    
    /**
     * Genera un servicio CRUD para un modelo específico
     */
    private generateCrudServiceForModel(modelName: string, modelSchema: any): string {
        const className = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        const serviceClassName = className + 'Service';
        
        // Analizar el esquema del modelo para determinar propiedades y tipos
        const modelProperties = this.extractModelProperties(modelSchema);
        
        // Generar interfaz del modelo
        const modelInterface = this.generateModelInterface(className, modelProperties);
        
        // Generar el servicio
        const serviceContent = `import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

${modelInterface}

@Injectable({
  providedIn: 'root'
})
export class ${serviceClassName} {
  private apiUrl = environment.apiUrl + '/${modelName.toLowerCase()}s';
  private ${modelName.toLowerCase()}sSubject = new BehaviorSubject<${className}[]>([]);
  ${modelName.toLowerCase()}s$ = this.${modelName.toLowerCase()}sSubject.asObservable();

  private httpOptions = {
    headers: new HttpHeaders({ 'Content-Type': 'application/json' })
  };

  constructor(private http: HttpClient) {
    // Cargar datos iniciales al instanciar el servicio
    this.getAll().subscribe();
  }

  /**
   * Obtiene todos los registros
   */
  getAll(): Observable<${className}[]> {
    return this.http.get<${className}[]>(this.apiUrl).pipe(
      tap(data => this.${modelName.toLowerCase()}sSubject.next(data)),
      catchError(this.handleError)
    );
  }

  /**
   * Obtiene un registro por su ID
   */
  getById(id: number | string): Observable<${className}> {
    const url = \`\${this.apiUrl}/\${id}\`;
    return this.http.get<${className}>(url).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Crea un nuevo registro
   */
  create(${modelName.toLowerCase()}: Omit<${className}, 'id'>): Observable<${className}> {
    return this.http.post<${className}>(this.apiUrl, ${modelName.toLowerCase()}, this.httpOptions).pipe(
      tap(newItem => {
        const currentItems = this.${modelName.toLowerCase()}sSubject.value;
        this.${modelName.toLowerCase()}sSubject.next([...currentItems, newItem]);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Actualiza un registro existente
   */
  update(${modelName.toLowerCase()}: ${className}): Observable<${className}> {
    const url = \`\${this.apiUrl}/\${${modelName.toLowerCase()}.id}\`;
    return this.http.put<${className}>(url, ${modelName.toLowerCase()}, this.httpOptions).pipe(
      tap(() => {
        const currentItems = this.${modelName.toLowerCase()}sSubject.value;
        const index = currentItems.findIndex(item => item.id === ${modelName.toLowerCase()}.id);
        if (index !== -1) {
          const updatedItems = [...currentItems];
          updatedItems[index] = ${modelName.toLowerCase()};
          this.${modelName.toLowerCase()}sSubject.next(updatedItems);
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Elimina un registro por su ID
   */
  delete(id: number | string): Observable<any> {
    const url = \`\${this.apiUrl}/\${id}\`;
    return this.http.delete<any>(url, this.httpOptions).pipe(
      tap(() => {
        const currentItems = this.${modelName.toLowerCase()}sSubject.value;
        this.${modelName.toLowerCase()}sSubject.next(currentItems.filter(item => item.id !== id));
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Busca registros que coincidan con un término
   */
  search(term: string): Observable<${className}[]> {
    if (!term.trim()) {
      return this.getAll();
    }
    
    return this.http.get<${className}[]>(\`\${this.apiUrl}/search?term=\${term}\`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Manejo de errores HTTP
   */
  private handleError(error: any) {
    let errorMessage = '';
    if (error.error instanceof ErrorEvent) {
      // Error del cliente
      errorMessage = \`Error: \${error.error.message}\`;
    } else {
      // Error del servidor
      errorMessage = \`Código de error: \${error.status}\\nMensaje: \${error.message}\`;
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}`;

        return serviceContent;
    }

    /**
     * Extrae propiedades y tipos de un modelo
     */
    private extractModelProperties(modelSchema: string): Map<string, string> {
        const properties = new Map<string, string>();
        
        try {
            // Si es una interfaz/clase TypeScript, extraer propiedades
            const interfacePattern = /interface\s+\w+\s*\{([^}]*)\}/;
            const classPattern = /class\s+\w+\s*\{([^}]*)\}/;
            
            let match = modelSchema.match(interfacePattern) || modelSchema.match(classPattern);
            
            if (match && match[1]) {
                const propertiesText = match[1];
                // Buscar propiedades con formato nombre: tipo
                const propertyPattern = /(\w+)\s*:\s*([\w\[\]<>|]+)/g;
                let propMatch;
                
                while ((propMatch = propertyPattern.exec(propertiesText)) !== null) {
                    properties.set(propMatch[1], propMatch[2]);
                }
            } else {
                // Si no se reconoce como interfaz/clase, intentar analizar como objeto JSON
                try {
                    const obj = typeof modelSchema === 'string' ? JSON.parse(modelSchema) : modelSchema;
                    
                    // Convertir valores del objeto a tipos TypeScript
                    for (const [key, value] of Object.entries(obj)) {
                        let type = 'any';
                        
                        if (typeof value === 'string') type = 'string';
                        else if (typeof value === 'number') type = 'number';
                        else if (typeof value === 'boolean') type = 'boolean';
                        else if (Array.isArray(value)) type = 'any[]';
                        else if (typeof value === 'object') type = 'object';
                        
                        properties.set(key, type);
                    }
                } catch (e) {
                    // Si no se puede analizar como JSON, asumir que es un objeto simple
                    properties.set('id', 'number');
                    properties.set('name', 'string');
                    properties.set('description', 'string');
                    properties.set('createdAt', 'Date');
                }
            }
        } catch (error) {
            this.logger.error('Error analizando esquema del modelo:', error);
            // Propiedades por defecto
            properties.set('id', 'number');
            properties.set('name', 'string');
            properties.set('createdAt', 'Date');
        }
        
        return properties;
    }

    /**
     * Genera una interfaz TypeScript para un modelo
     */
    private generateModelInterface(className: string, properties: Map<string, string>): string {
        let interfaceContent = `export interface ${className} {\n`;
        
        for (const [name, type] of properties.entries()) {
            interfaceContent += `  ${name}: ${type};\n`;
        }
        
        interfaceContent += '}\n\n';
        return interfaceContent;
    }

    /**
     * Detecta y genera modelos de datos basados en componentes y elementos visuales
     */
    private detectModelsFromComponents(components: any): Record<string, any> {
        const models: Record<string, any> = {};
        const potentialModelPatterns = {
            list: /list|table|grid|collection|items/i,
            form: /form|edit|create|update|input/i,
            detail: /detail|view|show|profile/i
        };
        
        // Analizar componentes para detectar posibles modelos
        for (const componentName in components) {
            const component = components[componentName];
            
            // Buscar signos de listas o tablas en el HTML (suelen indicar modelos)
            if (component.html && (
                component.html.includes('<table') || 
                component.html.includes('*ngFor') || 
                component.html.includes('list-group')
            )) {
                // Extraer posible nombre de modelo del componente
                const possibleModelName = this.extractModelNameFromComponent(componentName);
                
                if (possibleModelName && !models[possibleModelName]) {
                    // Analizar HTML para identificar propiedades del modelo
                    const properties = this.extractPropertiesFromHTML(component.html);
                    
                    // Crear modelo si se detectan suficientes propiedades
                    if (Object.keys(properties).length >= 2) {
                        models[possibleModelName] = this.generateModelInterface(
                            possibleModelName, 
                            new Map(Object.entries(properties))
                        );
                    }
                }
            }
            
            // Buscar formularios (suelen mapear a modelos)
            if (component.html && (
                component.html.includes('<form') || 
                component.html.includes('formGroup') || 
                component.html.includes('[(ngModel)]')
            )) {
                // Extraer posible nombre del modelo
                let possibleModelName = this.extractModelNameFromComponent(componentName);
                
                // Si parece ser un formulario de edición, limpiar prefijos
                if (componentName.includes('edit') || componentName.includes('form')) {
                    possibleModelName = possibleModelName.replace(/(Edit|Form|Create|Update)/g, '');
                }
                
                if (possibleModelName && !models[possibleModelName]) {
                    // Extraer propiedades del formulario
                    const properties = this.extractPropertiesFromForm(component.html, component.ts);
                    
                    // Crear modelo si se detectan suficientes propiedades
                    if (Object.keys(properties).length >= 2) {
                        models[possibleModelName] = this.generateModelInterface(
                            possibleModelName, 
                            new Map(Object.entries(properties))
                        );
                    }
                }
            }
        }
        
        // Consolidar modelos que podrían ser el mismo pero con ligeras diferencias de nombre
        const finalModels = this.consolidateSimilarModels(models);
        
        return finalModels;
    }
    
    /**
     * Extrae un nombre de modelo a partir del nombre de un componente
     */
    private extractModelNameFromComponent(componentName: string): string {
        // Eliminar prefijos comunes
        const cleaned = componentName
            .replace(/^app-/, '')
            .replace(/-?list$|-?table$|-?grid$|-?form$|-?edit$|-?view$|-?detail$/, '');
        
        // Convertir a formato PascalCase para el nombre del modelo
        return cleaned
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    }
    
    /**
     * Extrae propiedades de modelo a partir de HTML (buscando tablas, listas, etc.)
     */
    private extractPropertiesFromHTML(html: string): Record<string, string> {
        const properties: Record<string, string> = {
            'id': 'number'
        };
        
        // Buscar interpolaciones {{ property }} que pueden indicar propiedades del modelo
        const interpolationPattern = /{{([^}]+)}}/g;
        let match;
        
        while ((match = interpolationPattern.exec(html)) !== null) {
            let property = match[1].trim().split('.').pop();
            
            if (property && !property.includes('(') && !property.includes('+') && !property.includes('?')) {
                // Inferir tipo basado en nombre
                let type = 'string'; // por defecto
                
                if (property.includes('date') || property.includes('time')) {
                    type = 'Date';
                } else if (property.includes('price') || property.includes('amount') || 
                          property.includes('qty') || property.includes('count') ||
                          property.includes('total') || property.includes('id')) {
                    type = 'number';
                } else if (property.includes('active') || property.includes('enabled') ||
                          property.includes('completed') || property.includes('visible')) {
                    type = 'boolean';
                }
                
                properties[property] = type;
            }
        }
        
        // Buscar ngFor que suelen indicar arrays de modelos
        const ngForPattern = /\*ngFor="let (\w+) of ([^"]+)"/g;
        
        while ((match = ngForPattern.exec(html)) !== null) {
            const itemName = match[1]; // Nombre del elemento individual en el ngFor
            const collectionName = match[2].trim(); // Nombre del array/colección
            
            // Buscar propiedades accedidas desde el item
            const itemPropertyPattern = new RegExp(`${itemName}\\.([\\w]+)`, 'g');
            let propMatch;
            
            while ((propMatch = itemPropertyPattern.exec(html)) !== null) {
                const propName = propMatch[1];
                
                // Inferir tipo basado en nombre
                let type = 'string'; // por defecto
                
                if (propName.includes('date') || propName.includes('time')) {
                    type = 'Date';
                } else if (propName.includes('price') || propName.includes('amount') || 
                          propName.includes('qty') || propName.includes('count') ||
                          propName.includes('total') || propName.includes('id')) {
                    type = 'number';
                } else if (propName.includes('active') || propName.includes('enabled') ||
                          propName.includes('completed')) {
                    type = 'boolean';
                }
                
                properties[propName] = type;
            }
        }
        
        return properties;
    }
    
    /**
     * Extrae propiedades de modelo desde un formulario
     */
    private extractPropertiesFromForm(html: string, ts: string): Record<string, string> {
        const properties: Record<string, string> = {
            'id': 'number'
        };
        
        // Verificar si el formulario usa FormGroup (ReactiveFormsModule)
        if (html.includes('formGroup') && ts) {
            // Buscar formGroup en TS para identificar controles
            const formGroupPattern = /this\.(\w+)\s*=\s*this\.(\w+)\.group\(\{([^}]+)\}\)/;
            const match = ts.match(formGroupPattern);
            
            if (match) {
                // Extraer la inicialización del formGroup
                const formGroupText = match[3];
                
                // Extraer propiedades del formGroup (name: [value, validators])
                const formControlPattern = /(\w+):\s*\[(.*?)\]/g;
                let formControlMatch;
                
                while ((formControlMatch = formControlPattern.exec(formGroupText)) !== null) {
                    const controlName = formControlMatch[1];
                    const controlConfig = formControlMatch[2];
                    
                    // Inferir tipo basado en valor inicial y nombre
                    let type = 'string'; // por defecto
                    
                    if (controlConfig.includes('null')) {
                        // Podría ser cualquier tipo, usar el nombre para inferir
                        if (controlName.includes('date') || controlName.includes('time')) {
                            type = 'Date';
                        } else if (controlName.includes('price') || controlName.includes('amount') || 
                                 controlName.includes('qty') || controlName.includes('count') ||
                                 controlName.includes('id')) {
                            type = 'number';
                        } else if (controlName.includes('active') || controlName.includes('enabled') ||
                                  controlName.includes('completed')) {
                            type = 'boolean';
                        }
                    } else if (controlConfig.includes('\'') || controlConfig.includes('"')) {
                        type = 'string';
                    } else if (controlConfig.match(/^\d+/) || controlConfig.includes('Validators.min')) {
                        type = 'number';
                    } else if (controlConfig.includes('true') || controlConfig.includes('false')) {
                        type = 'boolean';
                    }
                    
                    properties[controlName] = type;
                }
            }
        } else {
            // Para formularios con ngModel
            const ngModelPattern = /\[(ngModel)\]="([^"]+)"/g;
            let ngModelMatch;
            
            while ((ngModelMatch = ngModelPattern.exec(html)) !== null) {
                const propPath = ngModelMatch[2].trim();
                
                // Extraer nombre de la propiedad (podría ser path como user.name)
                const propName = propPath.split('.').pop();
                
                if (propName) {
                    // Inferir tipo basado en tipo de input
                    const inputTypePattern = new RegExp(`<input[^>]*\\[(ngModel)\\]="${propPath}"[^>]*type="([^"]+)"`, 'i');
                    const typeMatch = html.match(inputTypePattern);
                    
                    let type = 'string'; // por defecto
                    
                    if (typeMatch) {
                        const inputType = typeMatch[2];
                        switch (inputType) {
                            case 'number':
                            case 'range':
                                type = 'number';
                                break;
                            case 'checkbox':
                                type = 'boolean';
                                break;
                            case 'date':
                            case 'datetime-local':
                                type = 'Date';
                                break;
                            default:
                                type = 'string';
                        }
                    } else {
                        // Inferir tipo basado en nombre
                        if (propName.includes('date') || propName.includes('time')) {
                            type = 'Date';
                        } else if (propName.includes('price') || propName.includes('amount') || 
                                  propName.includes('qty') || propName.includes('count') ||
                                  propName.includes('id')) {
                            type = 'number';
                        } else if (propName.includes('active') || propName.includes('enabled') ||
                                  propName.includes('completed')) {
                            type = 'boolean';
                        }
                    }
                    
                    properties[propName] = type;
                }
            }
        }
        
        return properties;
    }
    
    /**
     * Consolida modelos similares para evitar duplicación
     */
    private consolidateSimilarModels(models: Record<string, any>): Record<string, any> {
        const finalModels: Record<string, any> = {};
        const processed: string[] = [];
        
        const modelNames = Object.keys(models);
        
        // Calcular similitud entre modelos y consolidar
        for (let i = 0; i < modelNames.length; i++) {
            const modelName = modelNames[i];
            
            if (processed.includes(modelName)) {
                continue;
            }
            
            let bestMatch = modelName;
            let mostSimilarFields = 0;
            
            // Buscar modelos similares para consolidar
            for (let j = i + 1; j < modelNames.length; j++) {
                const otherModelName = modelNames[j];
                
                if (processed.includes(otherModelName)) {
                    continue;
                }
                
                // Calcular similitud entre los modelos
                const similarity = this.calculateModelSimilarity(models[modelName], models[otherModelName]);
                
                if (similarity > 0.7 && similarity > mostSimilarFields) {
                    bestMatch = this.chooseBetterModelName(modelName, otherModelName);
                    mostSimilarFields = similarity;
                    processed.push(otherModelName);
                }
            }
            
            // Usar el mejor nombre de modelo
            finalModels[bestMatch] = models[modelName];
            processed.push(modelName);
        }
        
        return finalModels;
    }
    
    /**
     * Calcula la similitud entre dos modelos (0-1)
     */
    private calculateModelSimilarity(model1: string, model2: string): number {
        // Extraer propiedades del primer modelo
        const props1 = new Set<string>();
        const propPattern = /(\w+):\s*([\w\[\]<>|]+)/g;
        let propMatch;
        
        while ((propMatch = propPattern.exec(model1)) !== null) {
            props1.add(propMatch[1]);
        }
        
        // Extraer propiedades del segundo modelo
        const props2 = new Set<string>();
        
        while ((propMatch = propPattern.exec(model2)) !== null) {
            props2.add(propMatch[1]);
        }
        
        // Calcular propiedades en común
        let commonProps = 0;
        props1.forEach(prop => {
            if (props2.has(prop)) {
                commonProps++;
            }
        });
        
        // Devolver ratio de similitud
        const totalProps = props1.size + props2.size;
        return totalProps > 0 ? (2 * commonProps) / totalProps : 0;
    }
    
    /**
     * Elige el mejor nombre entre dos modelos similares
     */
    private chooseBetterModelName(name1: string, name2: string): string {
        // Preferir nombres más cortos y significativos
        if (name1.length < name2.length * 0.7) {
            return name1;
        } else if (name2.length < name1.length * 0.7) {
            return name2;
        }
        
        // Preferir nombre sin sufijos
        const suffixes = ['Item', 'Entity', 'Model', 'Dto'];
        for (const suffix of suffixes) {
            if (name1.endsWith(suffix) && !name2.endsWith(suffix)) {
                return name2;
            } else if (!name1.endsWith(suffix) && name2.endsWith(suffix)) {
                return name1;
            }
        }
        
        // Por defecto, el más corto
        return name1.length <= name2.length ? name1 : name2;
    }
    
    /**
     * Detecta si un componente ya está en el array de importaciones
     */
    private isComponentImported(tsContent: string, className: string): boolean {
        return tsContent.includes(`import { ${className} }`) || tsContent.includes(`import {${className}}`);
    }
    
    /**
     * Actualiza el archivo environment.ts para incluir URL de API
     */
    private async updateEnvironmentFile(projectDir: string): Promise<void> {
        try {
            // Buscar archivo environment
            const envFiles = [
                path.join(projectDir, 'src', 'environments', 'environment.ts'),
                path.join(projectDir, 'src', 'environment.ts'), // Algunas versiones lo ponen aquí en Angular 19+
                path.join(projectDir, 'src', 'app', 'environments', 'environment.ts') // Otra ubicación posible
            ];
            
            let envFilePath = '';
            for (const file of envFiles) {
                if (fs.existsSync(file)) {
                    envFilePath = file;
                    break;
                }
            }
            
            // Si no existe, crear el archivo
            if (!envFilePath) {
                // Crear directorio si no existe
                const envDir = path.join(projectDir, 'src', 'environments');
                if (!fs.existsSync(envDir)) {
                    fs.mkdirSync(envDir, { recursive: true });
                }
                
                envFilePath = path.join(envDir, 'environment.ts');
                const content = `// This file can be replaced during build
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
`;
                fs.writeFileSync(envFilePath, content);
                
                // Crear también environment.prod.ts
                const prodEnvPath = path.join(envDir, 'environment.prod.ts');
                const prodContent = `export const environment = {
  production: true,
  apiUrl: 'https://api.yourdomain.com/api'
};
`;
                fs.writeFileSync(prodEnvPath, prodContent);
                
                this.logger.log('Archivos environment creados con URL de API');
                return;
            }
            
            // Si el archivo existe, verificar si ya tiene la propiedad apiUrl
            let envContent = fs.readFileSync(envFilePath, 'utf8');
            
            if (!envContent.includes('apiUrl')) {
                // Añadir apiUrl al environment
                envContent = envContent.replace(
                    /export const environment = \{/,
                    `export const environment = {\n  apiUrl: 'http://localhost:3000/api',`
                );
                
                fs.writeFileSync(envFilePath, envContent);
                this.logger.log('URL de API añadida a environment.ts');
            }
            
            // Hacer lo mismo para environment.prod.ts si existe
            const prodEnvPath = envFilePath.replace('environment.ts', 'environment.prod.ts');
            if (fs.existsSync(prodEnvPath)) {
                let prodEnvContent = fs.readFileSync(prodEnvPath, 'utf8');
                
                if (!prodEnvContent.includes('apiUrl')) {
                    prodEnvContent = prodEnvContent.replace(
                        /export const environment = \{/,
                        `export const environment = {\n  apiUrl: 'https://api.yourdomain.com/api',`
                    );
                    
                    fs.writeFileSync(prodEnvPath, prodEnvContent);
                }
            }
        } catch (error) {
            this.logger.warn('Error actualizando environment.ts:', error);
        }
    }
    
    /**
     * Combina contenido de componentes generados por CLI y por IA
     */
    private mergeComponentContent(cliContent: string, aiContent: string): string {
        // Extraer importaciones del CLI (son más estándar y correctas)
        const cliImportsMatch = cliContent.match(/(import[^;]+;[\r\n]*)+/);
        const cliImports = cliImportsMatch ? cliImportsMatch[0] : '';
        
        // Extraer @Component del CLI (selector, standalone, etc.)
        const cliComponentMatch = cliContent.match(/@Component\(\{[^}]+\}\)/s);
        const cliComponent = cliComponentMatch ? cliComponentMatch[0] : '';
        
        // Extraer nombre de la clase del CLI
        const cliClassNameMatch = cliContent.match(/export class ([A-Za-z0-9_]+)/);
        const cliClassName = cliClassNameMatch ? cliClassNameMatch[1] : '';
        
        // Extraer cuerpo de la clase de la IA (la funcionalidad real)
        let aiClassBodyMatch = aiContent.match(/export class [A-Za-z0-9_]+ [^{]*\{([\s\S]+)\}[\s\S]*$/);
        let aiClassBody = aiClassBodyMatch ? aiClassBodyMatch[1] : '';
        
        // Si no se pudo extraer, usar código AI completo
        if (!aiClassBody) {
            return aiContent;
        }
        
        // Fusionar todo
        const mergedContent = `${cliImports}
${cliComponent}
export class ${cliClassName} {${aiClassBody}}
`;
        
        return mergedContent;
    }
    
    /**
     * Combina servicios generados por CLI y por IA
     */
    private mergeServiceContent(cliContent: string, aiContent: string): string {
        // Extraer importaciones del CLI (base estándar)
        const cliImportsMatch = cliContent.match(/(import[^;]+;[\r\n]*)+/);
        const cliImports = cliImportsMatch ? cliImportsMatch[0] : '';
        
        // Extraer importaciones de la IA
        const aiImportsMatch = aiContent.match(/(import[^;]+;[\r\n]*)+/);
        let aiImports = aiImportsMatch ? aiImportsMatch[0] : '';
        
        // Eliminar duplicados de importaciones
        if (cliImports && aiImports) {
            const cliLines = cliImports.split('\n');
            const aiLines = aiImports.split('\n');
            
            for (const aiLine of aiLines) {
                if (!cliLines.some(cliLine => cliLine.trim() === aiLine.trim()) && aiLine.trim()) {
                    cliLines.push(aiLine);
                }
            }
            
            aiImports = cliLines.join('\n');
        }
        
        // Extraer @Injectable del CLI
        const cliInjectableMatch = cliContent.match(/@Injectable\(\{[^}]+\}\)/s);
        const cliInjectable = cliInjectableMatch ? cliInjectableMatch[0] : '';
        
        // Extraer nombre de la clase del CLI
        const cliClassNameMatch = cliContent.match(/export class ([A-Za-z0-9_]+)/);
        const cliClassName = cliClassNameMatch ? cliClassNameMatch[1] : '';
        
        // Extraer cuerpo de la clase de la IA (métodos y propiedades)
        let aiClassBodyMatch = aiContent.match(/export class [A-Za-z0-9_]+ [^{]*\{([\s\S]+)\}[\s\S]*$/);
        let aiClassBody = aiClassBodyMatch ? aiClassBodyMatch[1] : '';
        
        // Si no se pudo extraer, usar contenido AI
        if (!aiClassBody) {
            return aiContent;
        }
        
        // Fusionar todo
        const mergedContent = `${aiImports}

${cliInjectable}
export class ${cliClassName} {${aiClassBody}}
`;
        
        return mergedContent;
    }
    
    /**
     * Añade un componente manualmente cuando falla el CLI
     */
    private async addComponentManually(projectDir: string, componentName: string, componentData: any): Promise<void> {
        try {
            const componentsDir = path.join(projectDir, 'src', 'app', 'components');
            if (!fs.existsSync(componentsDir)) {
                fs.mkdirSync(componentsDir, { recursive: true });
            }
            
            // Crear directorio para el componente
            const componentDir = path.join(componentsDir, componentName);
            if (!fs.existsSync(componentDir)) {
                fs.mkdirSync(componentDir, { recursive: true });
            }
            
            // Escribir archivos del componente
            if (componentData.ts) {
                // Asegurar que el selector sea correcto
                let tsContent = componentData.ts;
                if (!tsContent.includes(`selector: 'app-${componentName}'`)) {
                    tsContent = tsContent.replace(
                        /selector: ['"].*?['"],/,
                        `selector: 'app-${componentName}',`
                    );
                    
                    // Si no hay un selector, añadirlo
                    if (!tsContent.includes('selector:')) {
                        tsContent = tsContent.replace(
                            /@Component\(\{/,
                            `@Component({\n  selector: 'app-${componentName}',`
                        );
                    }
                }
                
                // Asegurar que el templateUrl y styleUrls sean correctos
                tsContent = tsContent.replace(/templateUrl: ['"].*?['"],/, `templateUrl: './${componentName}.component.html',`);
                
                // Determinar extensión de estilos a partir del proyecto o usar scss por defecto
                const styleExt = this.getStyleExtensionFromAngularJson(projectDir) || 'scss';
                tsContent = tsContent.replace(
                    /styleUrls: \[['"].*?['"]]/,
                    `styleUrls: ['./${componentName}.component.${styleExt}']`
                );
                
                fs.writeFileSync(path.join(componentDir, `${componentName}.component.ts`), tsContent);
            }
            
            if (componentData.html) {
                fs.writeFileSync(path.join(componentDir, `${componentName}.component.html`), componentData.html);
            } else {
                // Crear HTML básico
                fs.writeFileSync(path.join(componentDir, `${componentName}.component.html`), `<div>\n  ${componentName} works!\n</div>`);
            }
            
            // Determinar extensión de estilos a partir del proyecto o usar scss por defecto
            const styleExt = this.getStyleExtensionFromAngularJson(projectDir) || 'scss';
            
            if (componentData.scss || componentData.css) {
                fs.writeFileSync(
                    path.join(componentDir, `${componentName}.component.${styleExt}`),
                    componentData.scss || componentData.css
                );
            } else {
                // Crear estilos básicos
                fs.writeFileSync(path.join(componentDir, `${componentName}.component.${styleExt}`), `/* ${componentName} Component Styles */`);
            }
            
            this.logger.log(`Componente ${componentName} creado manualmente con éxito`);
        } catch (error) {
            this.logger.error(`Error creando componente ${componentName} manualmente:`, error);
            throw error;
        }
    }
    
    private cleanupTempFiles(projectDir: string): void {
        try {
            this.logger.log(`Limpiando archivos temporales en ${projectDir}...`);
            
            if (fs.existsSync(projectDir)) {
                // Eliminar directorio recursivamente
                fs.rmSync(projectDir, { recursive: true, force: true });
            }
        } catch (error) {
            this.logger.error('Error limpiando archivos temporales:', error);
            // No lanzamos error, solo registramos para no interrumpir el flujo principal
        }
    }
}