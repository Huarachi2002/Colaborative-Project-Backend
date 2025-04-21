import { User } from "@prisma/client";


export interface IResponseUsers{
  users: User[];
  total: number;
}


export interface IResponseUser {
  user: User;
}