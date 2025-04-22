import { BadRequestException, forwardRef, Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/services';
import { UserService } from 'src/user/services';
import { RoomService } from './room.service';
import { Room, User, User_Room } from '@prisma/client';
import { AddUserRoomDto, RemovedUserRoomDto } from '../dto';
import { MailService } from 'src/mail/services';

@Injectable()
export class UserRoomService {

  //#region CONSTRUCTOR
  constructor(
    private readonly prismaService: PrismaService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => RoomService))
    private readonly roomService: RoomService,
    private readonly mailService: MailService
  ) {}
  //#endregion CONSTRUCTOR

  //#region METHODS

  public async findUserRoom(
    userId: string,
    roomId: number
  ):Promise<User_Room> {
    const findUserRoom = await this.prismaService.user_Room.findFirst({
      where:{
        room_id: roomId,
        user_id: userId
      }
    });
    return findUserRoom;
  }  

  public async hasAccessToRoom(
    userId: string,
    roomId: number
  ): Promise<boolean> {
    const userRoom = await this.prismaService.user_Room.findFirst({
      where: {
        room_id: roomId,
        user_id: userId,
        status: "MIEMBRO"
      }
    });
    return !!userRoom;
  }

  public async findRoomsByUserId(userId: string,): Promise<Room[]> {
    const findRooms = await this.prismaService.room.findMany({
      where: {
        users: {
          some: {
            user_id: userId,
            status: "MIEMBRO"
          }
        }
      }
    });
    return findRooms;
  
  }

  public async invitationUserRoom(
    addUserRoomDto: AddUserRoomDto,
    // roomId: number
  ): Promise<void>{
    // const findUser = await this.userService.findIdUser(addUserRoomDto.userId);
    // const findRoom =  await this.roomService.findIdRoom(roomId);

    // const finduserRoom = await this.findUserRoom(findUser.id,findRoom.id);
    
    // let existUserRoom: Boolean = finduserRoom != null;

    // if (existUserRoom && finduserRoom.status === "MIEMBRO") {
    //   throw new BadRequestException("El usuario ya se encuentra activo en la sala");
    // }
    try {
      const {emails, name} = addUserRoomDto;
      
        emails.forEach(async (email) => {
          await this.mailService.sendInvitationRoom(
            {
              code: addUserRoomDto.code,
              email,
              name
            }
          )
        });
        

        // let createInvitationRoom: User_Room ;

        // createInvitationRoom = await t.user_Room.create({
        //   data: {
        //     room_id: findRoom.id,
        //     user_id: findUser.id,
        //   }
        // });

        // if (existUserRoom) {
        //   // Si ya existe una relación, actualizar su estado
        //   createInvitationRoom = await t.user_Room.update({
        //     where: {
        //       user_id_room_id: {
        //         user_id: findUser.id,
        //         room_id: findRoom.id
        //       }
        //     },
        //     data: {
        //       status: "INVITATION"
        //     }
        //   });
        // } else {
        //   // Si no existe, crear una nueva relación
        //   createInvitationRoom = await t.user_Room.create({
        //     data: {
        //       room_id: findRoom.id,
        //       user_id: findUser.id,
        //       status: "INVITATION" 
        //     }
        //   });
        // }

    } catch (err) {
      throw new InternalServerErrorException("Ocurrio un error inesperador: ", err)
    }
  }

  public async findActiveUserRoom(roomId: number,): Promise<User[]> {
    const users = await this.prismaService.user.findMany({
      where: {
        rooms: {
          some: {
            room_id: roomId,
            status: "MIEMBRO"
          }
        }
      }
    });

    return users;
  }

  // public async acceptInvitation(
  //   user_id: string,
  //   room_id: number
  // ): Promise<User_Room>{
  //   const findUserRoom = await this.findUserRoom(user_id,room_id);

  //   if(!findUserRoom)
  //     throw new NotFoundException("El usuario no tiene ninguna invitacion.");

  //   if (findUserRoom.status !== "INVITATION") {
  //     throw new BadRequestException("No hay una invitación pendiente para este usuario en esta sala");
  //   }

  //   const findUser = await this.userService.findIdUser(user_id);
  //   const findRoom = await this.roomService.findIdRoom(room_id);

  //   await this.mailService.acceptInvitation({
  //     room: findRoom,
  //     user: findUser
  //   });

  //   const updatedUserRoom = await this.prismaService.user_Room.update({
  //     where: {
  //       user_id_room_id: {
  //         room_id: findUserRoom.room_id,
  //         user_id: findUserRoom.user_id
  //       }
  //     },
  //     data: {
  //       status: "MIEMBRO"
  //     }
  //   });
  //   return updatedUserRoom;
  // }

  public async blockedUserToRoom(roomId: number, userToExcludeId: string, currentUserId: string): Promise<User_Room>{
    // Verify if the room exists
    const findIdRoom = await this.roomService.findIdRoom(roomId);
    
    // Verify if current user exists and has permission
    const currentUser = await this.userService.findIdUser(currentUserId);
    const currentUserRoom = await this.findUserRoom(
      currentUser.id,
      findIdRoom.id
    );

    if (!currentUserRoom || currentUserRoom.status !== "MIEMBRO") {
      throw new BadRequestException("No tienes permisos para excluir usuarios de esta sala");
    }

    // Verify if user to exclude exists and is in the room
    const userToExclude = await this.userService.findIdUser(userToExcludeId);
    const userToExcludeRoom = await this.findUserRoom(
      userToExclude.id,
      findIdRoom.id
    );

    if (!userToExcludeRoom) {
      throw new NotFoundException("El usuario no pertenece a esta sala");
    }

    const updateUserRoom = await this.prismaService.user_Room.update({
      where: {
        user_id_room_id: {
          user_id: userToExclude.id,
          room_id: roomId
        },
      },
      data: {
        status: "BLOCKED"
      }
    })
    return updateUserRoom;
  }

  public async refusedInvitation(    
    user_id: string,
    room_id: number
  ): Promise<User_Room>{
    const findUserRoom = await this.findUserRoom(user_id,room_id);

    if(!findUserRoom)
      throw new NotFoundException("El usuario no tiene ninguna invitacion.");

    if (findUserRoom.status !== "INVITATION") {
      throw new BadRequestException("No hay una invitación pendiente para este usuario");
    }

    const updatedUserRoom = await this.prismaService.user_Room.update({
      where: {
        user_id_room_id: {
          user_id: findUserRoom.user_id,
          room_id: findUserRoom.room_id
        },
      },
      data: {
        status: "REFUSED"
      }
    });

    return updatedUserRoom;
  }

  public async removedUserRoom(
    removedDto: RemovedUserRoomDto,
    roomId: number
  ): Promise<User_Room> {
    const findUser = await this.userService.findIdUser(removedDto.userId);

    const findUserRoom = await this.findUserRoom(findUser.id,roomId);

    if (!findUserRoom) {
      throw new BadRequestException("El usuario no pertenece a esta sala");
    }

    if (findUserRoom.status !== "MIEMBRO") {
      throw new BadRequestException("El usuario no está activo en esta sala");
    }

    const updatedUserRoom = await this.prismaService.user_Room.update({
      where: {
        user_id_room_id: {
          room_id: findUserRoom.room_id,
          user_id: findUserRoom.user_id
        }
      },
      data: {
        status: "REMOVED"
      }
    });

    return updatedUserRoom;
  }

  //#endregion METHODS
}
