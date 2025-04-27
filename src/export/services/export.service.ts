import { Injectable } from "@nestjs/common";
import { AiProcessingService } from "src/import/services/ai-processing.service";
import * as JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ExportService {
    constructor(
        private readonly aiProcessingService: AiProcessingService
    ) {}

    public async generateAngularProject(createAngularDto: any): Promise<Buffer> {
        try {
            const { projectName, canvasImage, options} = createAngularDto;

            const zip = new JSZip();

            this.addAngularProjectStructure(zip, options);

            if (!canvasImage) {
                throw new Error('Se requiere una imagen del canvas');
            }

            const generatedComponents = await this.generateComponentsFromCanvasImage(canvasImage, options);

            this.addGeneratedComponents(zip, generatedComponents, options);

            // Configuración mejorada para generación de ZIP
            const zipBuffer = await zip.generateAsync({
                type: "nodebuffer",
                compression: "DEFLATE",
                compressionOptions: { level: 6 }, // Nivel de compresión más moderado para evitar problemas
                platform: "UNIX", // Usar formato UNIX para mayor compatibilidad
                comment: "Proyecto Angular generado por Collaborative Project"
            });

            return zipBuffer;
        } catch (error) {
            console.error('Error generando proyecto Angular:', error);
            throw new Error('Error al generar el proyecto Angular: ' + error.message);
        }
    }

    private async generateComponentsFromCanvasImage(imageBase64: string, options: any): Promise<any> {
        try {
            // Eliminar el prefijo "data:image/jpeg;base64," si está presente
            if (imageBase64.includes('base64,')) {
                imageBase64 = imageBase64.split('base64,')[1];
            }

            const componentCode = await this.aiProcessingService.generateAngularComponents({
                imageBase64: imageBase64,
                options: JSON.stringify(options),
            });

            return componentCode;
        } catch (error) {
            console.error('Error generando componentes con la imagen:', error);
            throw new Error('Error al generar componentes desde la imagen: ' + error.message);
        }
    }

    private addAngularProjectStructure(zip: JSZip, options: any): void {
        zip.file("package.json", this.generatePackageJson(options));

        zip.file("angular.json", this.generateAngularJson(options));

        zip.file("tsconfig.json", this.generateTsConfig());

        const src = zip.folder("src");
        const app = src.folder("app");
        const assets = src.folder("assets");
        const environments = src.folder("environments");

        src.file("index.html", this.generateIndexHtml(options.name));
        src.file("main.ts", this.generateMainTs());
        src.file("styles.css", this.generateStyles(options.cssFramework));

        environments.file("environment.ts", this.generateEnvironment(false));
        environments.file("environment.prod.ts", this.generateEnvironment(true));

        app.file("app.module.ts", this.generateAppModule(options));
        app.file("app.component.ts", this.generateAppComponent());
        app.file("app.component.html", this.generateAppComponentHtml());
        app.file("app.component.css", this.generateAppComponentScss());

        if(options.includeRouting) {
            app.file("app-routing.module.ts", this.generateRoutingModule());
        }
    }

    private addGeneratedComponents(zip: JSZip, generatedComponents: any, options: any): void {
        const app = zip.folder("src").folder("app");
        
        // Agregar componentes
        if (generatedComponents.components) {
            const components = app.folder("components");
            for (const componentName in generatedComponents.components) {
                const component = generatedComponents.components[componentName];
                const componentFolder = components.folder(componentName);

                if (component.ts) {
                    componentFolder.file(`${componentName}.component.ts`, component.ts);
                }

                if (component.html) {
                    componentFolder.file(`${componentName}.component.html`, component.html);
                }

                if (component.scss || component.css) {
                    componentFolder.file(`${componentName}.component.scss`, component.scss || component.css);
                }
            }
        }

        // Agregar servicios
        if (generatedComponents.services) {
            const services = app.folder("services");
            for (const serviceName in generatedComponents.services) {
                services.file(`${serviceName}.service.ts`, generatedComponents.services[serviceName]);
            }
        }

        // Agregar modelos
        if (generatedComponents.models) {
            const models = app.folder("models");
            for (const modelName in generatedComponents.models) {
                models.file(`${modelName}.model.ts`, generatedComponents.models[modelName]);
            }
        }

        // Agregar módulos adicionales
        if (generatedComponents.modules) {
            for (const moduleName in generatedComponents.modules) {
                app.file(`${moduleName}.module.ts`, generatedComponents.modules[moduleName]);
            }
        }

        // Configuración de rutas
        if (generatedComponents.routing) {
            app.file(`app-routing.module.ts`, generatedComponents.routing);
        }
    }

    private generatePackageJson(options: any): string {
        const {name, version} = options;

        return JSON.stringify({
            name: name,
            version: '0.0.0',
            scripts: {
                ng: 'ng',
                start: 'ng serve',
                build: 'ng build',
                watch: 'ng build --watch --configuration development',
                test: 'ng test',
            },
            private: true,
            dependencies: {
                '@angular/animations': `^${version}`,
                '@angular/common': `^${version}`,
                '@angular/compiler': `^${version}`,
                '@angular/core': `^${version}`,
                '@angular/forms': `^${version}`,
                '@angular/platform-browser': `^${version}`,
                '@angular/platform-browser-dynamic': `^${version}`,
                '@angular/router': `^${version}`,
                'rxjs': '~7.8.0',
                'tslib': '^2.3.0',
                'zone.js': '~0.13.0',
                ...(options.cssFramework === 'bootstrap' ? {
                'bootstrap': '^5.3.0',
                } : {}),
                ...(options.cssFramework === 'material' ? {
                '@angular/material': `^${version}`,
                } : {}),
            },
            devDependencies: {
                '@angular-devkit/build-angular': `^${version}`,
                '@angular/cli': `~${version}`,
                '@angular/compiler-cli': `^${version}`,
                '@types/jasmine': '~4.3.0',
                'jasmine-core': '~4.5.0',
                'karma': '~6.4.0',
                'karma-chrome-launcher': '~3.1.0',
                'karma-coverage': '~2.2.0',
                'karma-jasmine': '~5.1.0',
                'karma-jasmine-html-reporter': '~2.0.0',
                'typescript': '~5.1.3',
            },
        }, null, 2);
    }

    private generateAngularJson(options: any): string {
        const {name} = options;

        return JSON.stringify({
            "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
            "version": 1,
            "newProjectRoot": "projects",
            "projects": {
              [name]: {
                "projectType": "application",
                "schematics": {
                  "@schematics/angular:component": {
                    "style": "scss"
                  }
                },
                "root": "",
                "sourceRoot": "src",
                "prefix": "app",
                "architect": {
                  "build": {
                    "builder": "@angular-devkit/build-angular:browser",
                    "options": {
                      "outputPath": `dist/${name}`,
                      "index": "src/index.html",
                      "main": "src/main.ts",
                      "polyfills": ["zone.js"],
                      "tsConfig": "tsconfig.app.json",
                      "inlineStyleLanguage": "scss",
                      "assets": ["src/favicon.ico", "src/assets"],
                      "styles": [
                        "src/styles.scss",
                        ...(options.cssFramework === 'bootstrap' ? ["node_modules/bootstrap/dist/css/bootstrap.min.css"] : []),
                        ...(options.cssFramework === 'material' ? ["@angular/material/prebuilt-themes/indigo-pink.css"] : [])
                      ],
                      "scripts": [
                        ...(options.cssFramework === 'bootstrap' ? ["node_modules/bootstrap/dist/js/bootstrap.bundle.min.js"] : [])
                      ]
                    }
                  }
                }
              }
            }
        }, null, 2); 
    }

    private generateTsConfig(): string {
        return JSON.stringify({
          "compileOnSave": false,
          "compilerOptions": {
            "baseUrl": "./",
            "outDir": "./dist/out-tsc",
            "forceConsistentCasingInFileNames": true,
            "strict": true,
            "noImplicitOverride": true,
            "noPropertyAccessFromIndexSignature": true,
            "noImplicitReturns": true,
            "noFallthroughCasesInSwitch": true,
            "sourceMap": true,
            "declaration": false,
            "downlevelIteration": true,
            "experimentalDecorators": true,
            "moduleResolution": "node",
            "importHelpers": true,
            "target": "ES2022",
            "module": "ES2022",
            "lib": ["ES2022", "dom"]
          },
          "angularCompilerOptions": {
            "enableI18nLegacyMessageIdFormat": false,
            "strictInjectionParameters": true,
            "strictInputAccessModifiers": true,
            "strictTemplateTypeChecking": true
          }
        }, null, 2);
    }

    private generateIndexHtml(name: string): string {
        return `<!doctype html>
                <html lang="es">
                    <head>
                    <meta charset="utf-8">
                    <title>${name}</title>
                    <base href="/">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <link rel="icon" type="image/x-icon" href="favicon.ico">
                    </head>
                    <body>
                    <app-root></app-root>
                    </body>
                </html>`;
      }
      
      private generateMainTs(): string {
        return `import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
                import { AppModule } from './app/app.module';
                
                platformBrowserDynamic().bootstrapModule(AppModule)
                .catch(err => console.error(err));`;
      }
      
      private generateStyles(cssFramework: string): string {
        let styles = `/* Puede agregar estilos globales a este archivo y también importar otros archivos de estilos */
                        html, body {
                        margin: 0;
                        padding: 0;
                        font-family: Arial, sans-serif;
                        }
                        
                        * {
                        box-sizing: border-box;
                        }
                        `;
    
        if (cssFramework === 'material') {
          styles += `
            /* Tematización de materiales */
            @import '@angular/material/theming';
            @include mat-core();
            `;
        }
        
        return styles;
      }
      
      private generateEnvironment(isProd: boolean): string {
        return `export const environment = {
                    production: ${isProd},
                };`;
      }
      
    private generateAppModule(options: any): string {
        let imports = `import { NgModule } from '@angular/core';
        import { BrowserModule } from '@angular/platform-browser';
        import { AppComponent } from './app.component';
        import { HttpClientModule } from '@angular/common/http';
        import { FormsModule, ReactiveFormsModule } from '@angular/forms';
        `;
    
        if (options.includeRouting) {
          imports += `import { AppRoutingModule } from './app-routing.module';\n`;
        }
        
        if (options.cssFramework === 'material') {
          imports += `import { BrowserAnimationsModule } from '@angular/platform-browser/animations';\n`;
          imports += `import { MatButtonModule } from '@angular/material/button';\n`;
          imports += `import { MatCardModule } from '@angular/material/card';\n`;
          imports += `import { MatInputModule } from '@angular/material/input';\n`;
          imports += `import { MatToolbarModule } from '@angular/material/toolbar';\n`;
        }
        
        // Importar componentes generados
        imports += `
        // Componentes generados automáticamente
        // Para agregar nuevos componentes importados, modifica el arreglo de declarations
        `;
        
        let moduleImports = `
        BrowserModule,
        HttpClientModule,
        FormsModule,
        ReactiveFormsModule,`;
        
        if (options.includeRouting) {
          moduleImports += `\n    AppRoutingModule,`;
        }
        
        if (options.cssFramework === 'material') {
          moduleImports += `\n    BrowserAnimationsModule,`;
          moduleImports += `\n    MatButtonModule,`;
          moduleImports += `\n    MatCardModule,`;
          moduleImports += `\n    MatInputModule,`;
          moduleImports += `\n    MatToolbarModule,`;
        }
    
        return `${imports}
    
                @NgModule({
                declarations: [
                    AppComponent,
                    // Agrega aquí los componentes generados
                ],
                imports: [${moduleImports}
                ],
                providers: [],
                bootstrap: [AppComponent]
                })
                export class AppModule { }`;
    }
      
    private generateAppComponent(): string {
        return `import { Component } from '@angular/core';
    
                @Component({
                selector: 'app-root',
                templateUrl: './app.component.html',
                styleUrls: ['./app.component.scss']
                })
                export class AppComponent {
                title = 'Canvas Export';
                }`;
    }
      
      private generateAppComponentHtml(): string {
        return `<div class="app-container">
                    <header class="app-header">
                        <h1>{{ title }}</h1>
                    </header>
                    
                    <main>
                        <router-outlet></router-outlet>
                    </main>
                    
                    <footer class="app-footer">
                        <p>Generado automáticamente con Collaborative Project</p>
                    </footer>
                </div>`;
      }
      
      private generateAppComponentScss(): string {
        return `.app-container {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            }
            
            .app-header {
            background-color: #333;
            color: white;
            padding: 1rem;
            text-align: center;
            }
            
            main {
            flex: 1;
            padding: 1rem;
            }
            
            .app-footer {
            background-color: #f5f5f5;
            padding: 1rem;
            text-align: center;
            font-size: 0.875rem;
        }`;
      }
      
      private generateRoutingModule(): string {
        return `import { NgModule } from '@angular/core';
        import { RouterModule, Routes } from '@angular/router';
        
        const routes: Routes = [
        // Aquí puedes agregar tus rutas
        ];
        
        @NgModule({
        imports: [RouterModule.forRoot(routes)],
        exports: [RouterModule]
        })
        export class AppRoutingModule { }`;
      }
}