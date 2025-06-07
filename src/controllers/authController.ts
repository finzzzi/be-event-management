import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { PrismaClient } from "../generated/prisma";
import { sendResetPasswordEmail } from "../services/emailService";

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured in the .env");
}

// utility functions for points and coupons
const getValidPointsCondition = (userId: number) => ({
  userId,
  OR: [
    {
      expiredAt: {
        gt: new Date(),
      },
    },
    {
      expiredAt: null,
    },
  ],
  deletedAt: null,
});

const getValidCouponCondition = (userId: number) => ({
  userId,
  expiredAt: {
    gt: new Date(),
  },
  deletedAt: null,
});

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password, referral_code } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: "User already exists" });
      return;
    }

    // Validate referral code if provided
    let referrerUser = null;
    if (referral_code) {
      const referralCodeRecord = await prisma.referralCode.findUnique({
        where: { code: referral_code },
        include: { user: true },
      });

      if (!referralCodeRecord) {
        res.status(400).json({ message: "Invalid referral code" });
        return;
      }

      referrerUser = referralCodeRecord.user;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate referral code
    let newReferralCode = nanoid(6);
    while (
      await prisma.referralCode.findUnique({ where: { code: newReferralCode } })
    ) {
      newReferralCode = nanoid(6);
    }

    // Use database transaction for referral rewards
    const result = await prisma.$transaction(async (prisma) => {
      // Create user
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
        },
      });

      // Create referral code for the new user
      await prisma.referralCode.create({
        data: {
          userId: user.id,
          code: newReferralCode,
        },
      });

      // If user was referred by someone, create user referral record and give rewards
      if (referrerUser) {
        await prisma.userReferral.create({
          data: {
            userId: user.id, // User yang direferensikan (new user)
            referralId: referrerUser.id, // User yang mereferensikan
          },
        });

        // REFERRAL REWARDS:
        // 1. Give 10,000 coupon to new user (valid for 3 months)
        const couponExpiry = new Date();
        couponExpiry.setMonth(couponExpiry.getMonth() + 3);

        await prisma.coupon.create({
          data: {
            userId: user.id,
            nominal: 10000,
            expiredAt: couponExpiry,
          },
        });

        // 2. Give 10,000 points to referring user (expired in 3 months)
        const pointsExpiry = new Date();
        pointsExpiry.setMonth(pointsExpiry.getMonth() + 3);

        await prisma.point.create({
          data: {
            userId: referrerUser.id,
            point: 10000,
            expiredAt: pointsExpiry,
          },
        });
      }

      return user;
    });

    // Generate token
    const token = jwt.sign({ userId: result.id }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(201).json({ token });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(400).json({ message: "Invalid credentials" });
      return;
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ message: "Invalid credentials" });
      return;
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch (error) {
    next(error);
  }
};

export const verify = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({
      message: "Token is valid",
    });
  } catch (error) {
    next(error);
  }
};

export const getUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    // get user data without password, createdAt, updatedAt
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // get user's referral code
    const referralCode = await prisma.referralCode.findFirst({
      where: { userId },
      select: { code: true },
    });

    // get total valid points
    const userPoints = await prisma.point.aggregate({
      where: getValidPointsCondition(userId),
      _sum: {
        point: true,
      },
    });

    // get valid coupons
    const userCoupons = await prisma.coupon.findMany({
      where: getValidCouponCondition(userId),
      select: {
        id: true,
        nominal: true,
        expiredAt: true,
      },
    });

    res.status(200).json({
      message: "User profile retrieved successfully",
      data: {
        ...user,
        referralCode: referralCode?.code || null,
        points: {
          total: userPoints._sum.point || 0,
        },
        coupons: userCoupons,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const requestResetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ message: "Email is required" });
      return;
    }

    // check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(200).json({
        message: "User not found",
      });
      return;
    }

    // generate secure token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // set expiry time (1 hour from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // save token to database
    await prisma.passwordResetToken.create({
      data: {
        email,
        token: resetToken,
        expiresAt,
      },
    });

    // send email
    await sendResetPasswordEmail(email, resetToken);

    res.status(200).json({
      message: "Reset link has been sent to your email",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    next(error);
  }
};

export const confirmResetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({ message: "Token and new password are required" });
      return;
    }

    // find valid token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!resetToken) {
      res.status(400).json({ message: "Invalid or expired reset token" });
      return;
    }

    // hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // update user password and mark token as used
    await prisma.$transaction(async (prisma) => {
      await prisma.user.update({
        where: { email: resetToken.email },
        data: { password: hashedPassword },
      });

      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });
    });

    res.status(200).json({
      message: "Password has been reset successfully",
    });
  } catch (error) {
    console.error("Confirm reset password error:", error);
    next(error);
  }
};

export const validateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.query;

    if (!token) {
      res.status(400).json({ message: "Token is required" });
      return;
    }

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: token as string,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!resetToken) {
      res.status(400).json({
        valid: false,
        message: "Invalid or expired reset token",
      });
      return;
    }

    res.status(200).json({
      valid: true,
      message: "Token is valid",
    });
  } catch (error) {
    next(error);
  }
};

export const switchRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { role } = req.body;

    const user = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role },
    });

    res.status(200).json({
      message: "Role has been switched successfully",
    });
  } catch (error) {
    next(error);
  }
};
