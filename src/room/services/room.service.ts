import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Room } from '@prisma/client';
import { QueryCommonDto } from 'src/common/dto';
import { PrismaService } from 'src/prisma/services';
import { CreateRoomDto } from '../dto';
import { UserService } from 'src/user/services';
import { UserRoomService } from './user-room.service';
import { IResponseRoomAll } from '../interfaces';

@Injectable()
export class RoomService {
  private characteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; 

  constructor(
    private readonly prismaService: PrismaService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => UserRoomService))
    private readonly userRoomService: UserRoomService
  ) {}


  private generateCodeRoom(): string {
    let codigo = '';
    for (let i = 0; i < 6; i++) {
      const indiceAleatorio = Math.floor(Math.random() * this.characteres.length);
      codigo += this.characteres[indiceAleatorio];
    }
    return codigo.toUpperCase();
  }

  public async findAll(
    {
      search,
      limit,
      skip
    }: QueryCommonDto,
      userId: string
  ): Promise<IResponseRoomAll[]>{
    const findAllRoom = await this.prismaService.room.findMany({
      where: {
        AND: [
          {
            name: {
              contains: search,
              mode: "insensitive"
            }
          },
          {
            users: {
              some: {
                user_id: userId,
                status: "MIEMBRO"
              }
            }
          },
        ]
      },
      take: limit,
      skip,
      select: {
        id: true,
        idRoom: true,
        code: true,
        name: true,
        description: true,
        maxMembers: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: {
            user_id: userId,
            status: "MIEMBRO"
          },
        }
      }
    })
    return findAllRoom;
  }

  public async countAll (
    {
      search,
    }: QueryCommonDto,
    userId: string): Promise<number> {
    const findAllRoom = await this.prismaService.room.count({
      where: {
        AND: [
          {
            name: {
              contains: search,
              mode: "insensitive"
            }
          },
          {
            users: {
              some: {
                user_id: userId,
                status: "MIEMBRO"
              }
            }
          }
        ]
      },
    })
    return findAllRoom;
  }


  public async findIdRoom(id: number, select?: Prisma.RoomSelect): Promise<any> {
    const findRoom = await this.prismaService.room.findUnique({
      where: {
        id
      },
      select: select
    });
    if(!findRoom)
      throw new NotFoundException("La sala no se encuentra")

    return findRoom;
  }

  private async findRoomName(name: string){
    const findRoom = await this.prismaService.room.findFirst({
      where: {
        name
      },
    });

    return findRoom;
  }


  public async createRoom(createRoomDto:CreateRoomDto, userId: string): Promise<Room>{
    const findeUser = await this.userService.findIdUser(userId);

    const findRoomName = await this.findRoomName(createRoomDto.name);
    if(findRoomName)
      throw new BadRequestException("Ingrese otro nombre")

    const createRoom = await this.prismaService.room.create({
      data: {
        idRoom: createRoomDto.idRoom,
        name: createRoomDto.name,
        description: createRoomDto.description,
        code: this.generateCodeRoom(),
        maxMembers: createRoomDto.maxMembers,
        createdBy: createRoomDto.createdBy,
        users:{
          create: {
            user_id: findeUser.id,
            status: "MIEMBRO",
          }
        },
      }
    })

    return createRoom;
  }

  public async updateRoom(id:number, createRoomDto:CreateRoomDto, userId: string): Promise<Room>{
    const findUser = await this.userService.findIdUser(userId);

    const findIdRoom = await this.findIdRoom(id);

    const findRoomName = await this.prismaService.room.findMany({
      where: {
        AND: [
          {
            id: {
              not: findIdRoom.id
            }
          },
          {
            name: createRoomDto.name
          }
        ]
      }
    })

    if (findRoomName.length) {
      throw new BadRequestException("Ya existe otra sala con ese nombre");
    }

    const findUserRoom = await this.userRoomService.findUserRoom(
        findUser.id,
        findIdRoom.id
    );

    if (!findUserRoom) {
      throw new BadRequestException("No tienes acceso a esta sala");
    }

    if (findUserRoom.status !== "MIEMBRO") {
      throw new BadRequestException("No tienes acceso activo a esta sala");
    }

    const updateRoom = await this.prismaService.room.update({
      where: {
        id: findIdRoom.id
      },
      data: {
        name: createRoomDto.name,
        description: createRoomDto.description,
        maxMembers: createRoomDto.maxMembers,
      }
    })

    return updateRoom;
  }

  public async updateCodeRoom(id: number,  userId: string): Promise<Room> { 
    const findUser = await this.userService.findIdUser(userId);

    const findIdRoom = await this.findIdRoom(id);

    const findUserRoom = await this.userRoomService.findUserRoom(
      findUser.id,
      findIdRoom.id
    );

    const updateCodeRoom = await this.prismaService.room.update({
      where: {
        id: findIdRoom.id
      },
      data: {
        code: this.generateCodeRoom()
      }
    })
    return updateCodeRoom;
  }

}
