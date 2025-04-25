import { BadRequestException, forwardRef, Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/services';
import { UserService } from 'src/user/services';
import { RoomService } from './room.service';
import { Room, User, User_Room } from '@prisma/client';
import { AddUserRoomDto, RemovedUserRoomDto } from '../dto';
import { MailService } from 'src/mail/services';
import { InvitedUserRoomDto } from '../dto/invited-user-room.dto';

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

  public async findRoomByIdRoom (idRoom: string): Promise<Room> {
    const findRoom = await this.prismaService.room.findFirst({
      where: {
        idRoom: idRoom
      }
    });
    return findRoom;

  }

  public async hasAccessToRoom(
    userId: string,
    roomId: number
  ): Promise<boolean> {
    const userRoom = await this.prismaService.user_Room.findFirst({
      where: {
        room_id: roomId,
        user_id: userId,
        status: {
          in: ["OWNER", "INVITADO"]
        }
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
            status: {
              in: ["OWNER", "INVITADO"]
            }
          }
        }
      }
    });
    return findRooms;
  
  }

  public async addUserRoom(
    addUserRoomDto: AddUserRoomDto,
  ): Promise<void> {
    try {
      const { idRoom, idUser } = addUserRoomDto;
      const findUser = await this.userService.findIdUser(idUser);
      if (!findUser) {
        throw new NotFoundException("El usuario no existe.");
      }
      const findRoom = await this.roomService.findIdRoom(idRoom);
      if (!findRoom) {
        throw new NotFoundException("La sala no existe.");
      }

      
      const findUserRoom = await this.findUserRoom(findUser.id, findRoom.id);
      if (findUserRoom) {
        // Si existe, verificar su estado
        if (findUserRoom.status === "BLOCKED") {
          throw new BadRequestException("El usuario está bloqueado en esta sala.");
        }
        
        // El usuario ya pertenece a la sala con otro estado
        throw new BadRequestException("El usuario ya pertenece a esta sala.");
      }

      const roomFull = await this.countUsersInRoom(findRoom.id);
      if (roomFull >= findRoom.maxMembers) {
        throw new BadRequestException("La sala está llena.");
      }
      
      await this.prismaService.user_Room.create({
        data: {
          user_id: findUser.id,
          room_id: findRoom.id,
          status: "INVITADO"
        }
      });

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      } else if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      } else {
        throw new InternalServerErrorException("Ocurrió un error inesperado", error);
      }
    }
  }
  
  public async deleteUserRoom(id: number){
    const deleteUserRoom = await this.prismaService.user_Room.deleteMany({
      where: {
        room_id: Number(id)
      }
    });
    return deleteUserRoom;
  }

  public async validateJoinRoom(idRoom: number , idUser: string): Promise<boolean>{
    const validateJoin = await this.prismaService.user_Room.findFirst({
      where: {
        room_id: Number(idRoom),
        user_id: idUser,
        status: {
          in: ["OWNER", "INVITADO"]
        }
      }
    });

    if(validateJoin){
      return true;
    }else{
      return false;
    } 
  }

  public async countUsersInRoom(roomId: number): Promise<number> {
    const count = await this.prismaService.user_Room.count({
      where: {
        room_id: roomId,
        status: {
          in: ["OWNER", "INVITADO"]
        }
      }
    });
    return count;
  }

  public async changeUserRoomStatus(
    userId: string,
    roomId: number,
    status: string
  ): Promise<any> {
    const findUserRoom = await this.findUserRoom(userId, roomId);
    if (!findUserRoom) {
      return
    }

    await this.prismaService.user_Room.update({
      where: {
        user_id_room_id: {
          user_id: findUserRoom.user_id,
          room_id: findUserRoom.room_id
        }
      },
      data: {
        status
      }
    });

  }

  public async invitationUserRoom(
    invitedUserRoomDto: InvitedUserRoomDto,
  ): Promise<void>{
    try {
      const {emails, name} = invitedUserRoomDto;
      
      emails.forEach(async (email) => {
        const user = await this.userService.findUserEmail(email)
        const room = await this.roomService.getRoomByName(name);

        if(user){
          await this.changeUserRoomStatus(user.id, room.id, "INVITADO")
        }
        await this.mailService.sendInvitationRoom(
          {
            code: invitedUserRoomDto.code,
            email,
            name
          }
        )
      });

    } catch (err) {
      throw new InternalServerErrorException("Ocurrio un error inesperador: ", err)
    }
  }

  public async findRoomsCreatedByUserId(userId: string): Promise<any[]> {
    const findRooms = await this.prismaService.room.findMany({
      where: {
        users: {
          some: {
            user_id: userId,
            status: "OWNER"
          }
        },
      },
      include: {
        users: {
          where: {
            status: {
              in: ["OWNER", "INVITADO"]
            }
          },
          include: {
            user: true // Include user details
          }
        },
        _count: {
          select: { 
            users: true 
          }
        }
      }
    });
    
    // Calculate active users count for each room
    const roomsWithUserInfo = findRooms.map(room => ({
      ...room,
      activeUserCount: room.users.length,
    }));

    return roomsWithUserInfo;
  }

  public async findRoomsInvitedByUserId(userId: string,): Promise<any[]> {
    const findRooms = await this.prismaService.room.findMany({
      where: {
        users: {
          some: {
            user_id: userId,
            status: "INVITADO"
          }
        }
      },
      include: {
        users: {
          where: {
            status: {
              in: ["OWNER", "INVITADO"]
            }
          },
          include: {
            user: true // Include user details
          }
        },
        _count: {
          select: { 
            users: true 
          }
        }
      }
    });
    
    // Calculate active users count for each room
    const roomsWithUserInfo = findRooms.map(room => ({
      ...room,
      activeUserCount: room.users.length,
    }));

    return roomsWithUserInfo;
  }

  public async findActiveUserRoom(roomId: number,): Promise<User[]> {
    const users = await this.prismaService.user.findMany({
      where: {
        rooms: {
          some: {
            room_id: roomId,
            status: {
              in: ["OWNER", "INVITADO"]
            }
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

  public async blockedUserToRoom(roomId: number, userToExcludeId: string): Promise<User_Room>{
    // Verify if the room exists
    const findIdRoom = await this.roomService.findIdRoom(roomId);
    if (!findIdRoom) {
      throw new NotFoundException("La sala no existe");
    }

    // Verify if user to exclude exists and is in the room
    const userToExclude = await this.userService.findIdUser(userToExcludeId);
    if (!userToExclude) {
      throw new NotFoundException("El usuario no existe");
    }
    // Verify if user to exclude is in the room
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

    // if(!findUserRoom)
    //   throw new NotFoundException("El usuario no tiene ninguna invitacion.");

    // if (findUserRoom.status !== "INVITADO") {
    //   throw new BadRequestException("No hay una invitación pendiente para este usuario");
    // }

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

    // if (findUserRoom.status === "BLOCKED") {
    //   throw new BadRequestException("El usuario no está activo en esta sala");
    // }

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
