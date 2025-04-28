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

    /**
     * Corrige errores comunes en el archivo TypeScript de un componente
     */
    private fixComponentTsFile(componentName: string, tsContent: string): string {
        // 1. Asegurar que sea un componente standalone
        if (!tsContent.includes('standalone: true')) {
            tsContent = tsContent.replace(
                /@Component\(\{/,
                '@Component({\n  standalone: true,'
            );
        }
        
        // 2. Asegurar que tenga imports correctos (CommonModule para *ngFor, *ngIf, etc.)
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

    /**
     * Corrige errores comunes en archivos HTML de componentes
     */
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

    /**
     * Corrige errores comunes en servicios
     */
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

    /**
     * Genera un archivo de configuración de rutas básico
     */
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
            this.logger.log('Añadiendo componentes generados al proyecto...');
            
            // Determinar si estamos usando Angular con componentes standalone
            const isStandaloneComponent = this.isUsingStandaloneComponents(projectDir);
            const isAngular19Plus = this.determineAngularVersion() >= 19;
            
            // Organizar componentes por funcionalidad/módulo si es apropiado
            const componentsByFeature = this.organizeComponentsByFeature(generatedComponents.components || {});
            
            // Crear feature modules si no es un proyecto standalone y hay suficientes componentes
            if (!isStandaloneComponent && !isAngular19Plus && Object.keys(componentsByFeature).length > 1) {
                await this.createFeatureModules(projectDir, componentsByFeature, options);
            }
            
            // Actualizar app.module.ts para incluir componentes y módulos generados
            if (!isStandaloneComponent && !isAngular19Plus) {
                await this.updateAppModule(projectDir, generatedComponents, componentsByFeature);
            }
            
            // Agregar componentes asegurando la estructura de carpetas correcta
            if (generatedComponents.components) {
                await this.addComponentsToProject(projectDir, generatedComponents.components);
            }
            
            // Agregar servicios
            if (generatedComponents.services) {
                await this.addServicesToProject(projectDir, generatedComponents.services);
            }
            
            // Agregar modelos
            if (generatedComponents.models) {
                await this.addModelsToProject(projectDir, generatedComponents.models);
            }
            
            // Actualizar rutas si es necesario
            if (options.includeRouting) {
                // Para Angular 19+/standalone components, asegurar configuración de rutas correcta
                if (isStandaloneComponent || isAngular19Plus) {
                    await this.updateRoutingModule(projectDir, generatedComponents);
                    // Asegurar que app.config.ts tenga la configuración correcta para las rutas
                    await this.updateAppConfig(projectDir, options);
                } else {
                    // Para Angular tradicional con módulos
                    await this.updateRoutingModule(projectDir, generatedComponents);
                }
            }
            
            // Verificar y corregir los selectores de componentes
            await this.verifyComponentSelectors(projectDir, generatedComponents.components || {});
            
            this.logger.log('Componentes generados añadidos correctamente');
        } catch (error) {
            this.logger.error('Error añadiendo componentes generados:', error);
            throw new Error('Error al agregar componentes generados: ' + error.message);
        }
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