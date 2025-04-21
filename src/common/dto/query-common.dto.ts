import { IsOptional, IsInt, Min, IsString, MinLength } from 'class-validator';

export class QueryCommonDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  search?: string;
}