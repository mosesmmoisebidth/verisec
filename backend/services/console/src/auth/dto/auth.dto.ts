import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() fullName!: string;
  @IsEmail() email!: string;
  @IsString() businessName!: string;
  @IsString() @MinLength(8) password!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsOptional() @IsBoolean() remember?: boolean;
}

export class ForgotDto {
  @IsEmail() email!: string;
}

export class ResetDto {
  @IsEmail() email!: string;
  @IsString() code!: string;
  @IsString() @MinLength(8) password!: string;
}

export class VerifyEmailDto {
  @IsEmail() email!: string;
  @IsString() code!: string;
}

export class MfaCodeDto {
  @IsString() code!: string;
}

export class DeviceIdDto {
  @IsString() id!: string;
}

/** The onboarding after sign-up: the portal that brought the account here, and its answers. */
export class OnboardingDto {
  @IsIn(['kyc', 'fin']) portal!: 'kyc' | 'fin';
  @IsObject() answers!: Record<string, unknown>;
}
