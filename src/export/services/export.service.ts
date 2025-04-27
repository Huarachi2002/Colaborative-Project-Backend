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

            // Mejorar el prompt para incluir instrucciones sobre la integración de componentes
            const enhancedOptions = {
                ...options,
                needsAppIntegration: true // Indicar que necesitamos integrar los componentes en app.component
            };

            const componentCode = await this.aiProcessingService.generateAngularComponents({
                imageBase64: imageBase64,
                options: JSON.stringify(enhancedOptions),
            });

            return componentCode;
        } catch (error) {
            this.logger.error('Error generando componentes con la imagen:', error);
            throw new Error('Error al generar componentes desde la imagen: ' + error.message);
        }
    }
    
    private async addGeneratedComponentsToProject(projectDir: string, generatedComponents: any, options: any): Promise<void> {
        try {
            this.logger.log('Añadiendo componentes generados al proyecto...');
            
            // Actualizar app.module.ts para incluir componentes generados
            await this.updateAppModule(projectDir, generatedComponents);
            
            // Agregar componentes
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
                await this.updateRoutingModule(projectDir, generatedComponents);
            }
            
            this.logger.log('Componentes generados añadidos correctamente');
        } catch (error) {
            this.logger.error('Error añadiendo componentes generados:', error);
            throw new Error('Error al agregar componentes generados: ' + error.message);
        }
    }
    
    private async updateAppModule(projectDir: string, generatedComponents: any): Promise<void> {
        const appModulePath = path.join(projectDir, 'src', 'app', 'app.module.ts');
        
        if (!fs.existsSync(appModulePath)) {
            this.logger.warn('No se encontró app.module.ts');
            return;
        }
        
        let appModule = fs.readFileSync(appModulePath, 'utf8');
        
        // Recopilar componentes para importar
        const componentImports = [];
        const componentDeclarations = [];
        
        if (generatedComponents.components) {
            for (const componentName in generatedComponents.components) {
                const className = this.getComponentClassName(componentName);
                componentImports.push(`import { ${className} } from './components/${componentName}/${componentName}.component';`);
                componentDeclarations.push(className);
            }
        }
        
        // Agregar importaciones al principio del archivo
        if (componentImports.length > 0) {
            appModule = appModule.replace(
                'import { NgModule } from \'@angular/core\';',
                'import { NgModule } from \'@angular/core\';\n' + componentImports.join('\n')
            );
        }
        
        // Agregar declaraciones al array declarations
        if (componentDeclarations.length > 0) {
            appModule = appModule.replace(
                /declarations: \[([\s\S]*?)\]/,
                `declarations: [$1${componentDeclarations.length > 0 ? ',\n    ' + componentDeclarations.join(',\n    ') : ''}]`
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
                    `providers: [$1${serviceProviders.length > 0 ? ',\n    ' + serviceProviders.join(',\n    ') : ''}]`
                );
            }
        }
        
        fs.writeFileSync(appModulePath, appModule);
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
                fs.writeFileSync(path.join(componentDir, `${componentName}.component.ts`), component.ts);
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