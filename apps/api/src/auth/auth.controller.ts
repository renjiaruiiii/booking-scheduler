import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CookieOptions, Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AccessTokenGuard } from "./access-token.guard";
import type { AccessTokenPayload } from "./access-token.guard";
import { CurrentUser } from "./current-user.decorator";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

const refreshCookieName = "refresh_token";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get("me")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("USER", "RESOURCE_ADMIN", "SYSTEM_ADMIN")
  me(@CurrentUser() user: AccessTokenPayload) {
    return { user };
  }

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refreshToken, ...result } = await this.authService.login(dto);
    this.setRefreshCookie(response, refreshToken);
    return result;
  }

  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const { refreshToken, ...result } = await this.authService.refresh(
        this.readRefreshCookie(request),
      );
      this.setRefreshCookie(response, refreshToken);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        response.clearCookie(refreshCookieName, this.cookieOptions());
      }
      throw error;
    }
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(this.readRefreshCookie(request));
    response.clearCookie(refreshCookieName, this.cookieOptions());
    return { success: true };
  }

  private readRefreshCookie(request: Request) {
    const prefix = `${refreshCookieName}=`;
    const cookie = request.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);

    if (!cookie) return undefined;

    try {
      return decodeURIComponent(cookie);
    } catch {
      return undefined;
    }
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.configService.get<string>("NODE_ENV") === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
    };
  }

  private setRefreshCookie(response: Response, token: string) {
    response.cookie(refreshCookieName, token, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
