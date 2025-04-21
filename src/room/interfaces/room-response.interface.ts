import { Role, Room, User, User_Room } from "@prisma/client";


export interface IResponseRooms { 
  total: number;
  rooms: IResponseRoomAll[];
}


export interface IResponseRoom { 
  room: Room;
}

export interface IResponseRoomAll {
  id:           number;
  code:         string;
  name:         string;
  description:  string;
  status:       boolean; 
  createdAt:    Date;
  updatedAt:    Date;
  users:        IUsersRoomRole[];
}

interface IUsersRoomRole {
  role:         Role;
  createdAt:    Date;
}

export interface IResponseRoomId{
  room: IRoomID;
}
 
interface IRoomID {
  id:          number;
  name:        string;
  description: string;
  code:        string;
  status:      boolean;
  createdAt:   Date;
  updatedAt:   Date;
  users:       UserElement[];
}

interface UserElement extends User_Room {
  user:      User;
}


