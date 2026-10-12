import { IsEmail, IsString, Length, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  @Length(3, 50)
  username!: string;

  @IsEmail()
  @Length(5, 255)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
