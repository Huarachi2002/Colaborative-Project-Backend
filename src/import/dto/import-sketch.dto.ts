import { IsUUID } from "class-validator";


export class ImportSketchDto {
    @IsUUID()
    importId: string;
}