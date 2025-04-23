import { IsNumber, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateRoomDto {
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  name: string;

  @IsString()
  @MinLength(5)
  @MaxLength(255)
  description: string

  @IsNumber()
  @Min(1)
  @Max(10)
  maxMembers: number

}