import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

const scrypt = promisify(scryptCallback);
const refreshTokenTtlSeconds = 7 * 24 * 60 * 60;
const refreshTokenTtlMs = refreshTokenTtlSeconds * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await this.hashPassword(dto.password);

    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          passwordHash,
          roles: {
            create: {
              role: {
                connectOrCreate: {
                  where: { code: "USER" },
                  create: { code: "USER", name: "普通用户" },
                },
              },
            },
          },
        },
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          createdAt: true,
          roles: { select: { role: { select: { code: true, name: true } } } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("用户名或邮箱已存在");
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.identifier }, { email: dto.identifier }],
      },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("用户名或密码错误");
    }

    const passwordMatches = await this.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException("用户名或密码错误");
    }

    const accessToken = await this.createAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTokenTtlMs),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: this.toUserResponse(user),
    };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken)
      throw new UnauthorizedException("Refresh token is invalid");

    let payload: { sub: number; tokenType: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Refresh token is invalid");
    }

    if (!Number.isInteger(payload.sub) || payload.tokenType !== "refresh") {
      throw new UnauthorizedException("Refresh token is invalid");
    }

    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { roles: { include: { role: true } } } },
      },
    });
    const now = new Date();

    if (
      !record ||
      record.userId !== payload.sub ||
      record.revokedAt ||
      record.expiresAt <= now ||
      record.user.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException("Refresh token is invalid");
    }

    const newRefreshToken = await this.createRefreshToken(record.userId);
    const accessToken = await this.createAccessToken(record.user);

    await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException("Refresh token is invalid");
      }

      await transaction.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: this.hashToken(newRefreshToken),
          expiresAt: new Date(Date.now() + refreshTokenTtlMs),
        },
      });
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: this.toUserResponse(record.user),
    };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  private async createAccessToken(user: {
    id: number;
    username: string;
    roles: { role: { code: string } }[];
  }) {
    return this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      roles: user.roles.map(({ role }) => role.code),
    });
  }

  private async createRefreshToken(userId: number) {
    return this.jwtService.signAsync(
      { sub: userId, tokenType: "refresh" },
      {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: refreshTokenTtlSeconds,
      },
    );
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private toUserResponse(user: {
    id: number;
    username: string;
    email: string;
    status: string;
    roles: { role: { code: string; name: string } }[];
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      status: user.status,
      roles: user.roles.map(({ role }) => ({
        code: role.code,
        name: role.name,
      })),
    };
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}:${derivedKey.toString("hex")}`;
  }

  private async verifyPassword(password: string, storedHash: string) {
    const [salt, storedKey] = storedHash.split(":");
    if (!salt || !/^[a-f0-9]{128}$/.test(storedKey)) {
      return false;
    }

    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return timingSafeEqual(derivedKey, Buffer.from(storedKey, "hex"));
  }
}
