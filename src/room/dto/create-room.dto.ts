import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateRoomDto {
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  name: string;


  @IsString()
  @MinLength(10)
  @MaxLength(255)
  description: string

}