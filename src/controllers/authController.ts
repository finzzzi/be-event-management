import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured in the .env");
}

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

    // If user was referred by someone, create user referral record
    if (referrerUser) {
      await prisma.userReferral.create({
        data: {
          userId: user.id, // User yang direferensikan (new user)
          referralId: referrerUser.id, // User yang mereferensikan
        },
      });
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
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
