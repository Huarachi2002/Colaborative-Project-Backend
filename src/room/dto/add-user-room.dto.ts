import { Role } from "@prisma/client";
import { IsEnum, IsInt, IsNumber, IsString, IsUUID } from "class-validator";


export class AddUserRoomDto {
  @IsUUID()
  @IsString()
  userId: string;

  @IsEnum(Role, {
    message: "El rol no es valido"
  })
  role: Role;
}