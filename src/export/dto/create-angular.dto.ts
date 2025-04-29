import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

export class AngularOptions {
    @IsString()
    name: string;
    
    @IsBoolean()
    @IsOptional()
    includeRouting: boolean;
    
    @IsBoolean()
    @IsOptional()
    responsiveLayout: boolean;
    
    @IsString()
    @IsOptional()
    cssFramework: string;
    
    @IsBoolean()
    @IsOptional()
    generateComponents: boolean;
}

export class CreateAngularDto {

    @IsString()
    projectId: string;

    @IsString()
    projectName: string;

    @IsObject()
    @IsOptional()
    canvasObjects?: Record<string, any>;

    @IsString()
    @IsOptional()
    canvasImage?: string;

    @IsObject()
    options: AngularOptions;
}