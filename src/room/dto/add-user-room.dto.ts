import { IsArray, IsString } from "class-validator";


export class AddUserRoomDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  emails: string[];
}