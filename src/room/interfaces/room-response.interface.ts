import { Room, User, User_Room } from "@prisma/client";


export interface IResponseRooms { 
  total: number;
  rooms: IResponseRoomAll[];
}


export interface IResponseRoom { 
  room: Room;
}

export interface IResponseRoomAll {
  id:           number;
  idRoom:       string;
  code:         string;
  name:         string;
  description:  string;
  maxMembers:   number;
  createdBy:    string;
  createdAt:    Date;
  updatedAt:    Date;
  // users:        IUsersRoomRole[];
}

interface IUsersRoomRole {
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


