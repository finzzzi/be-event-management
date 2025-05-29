import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '../generated/prisma';

const JWT_SECRET = process.env.JWT_SECRET;

const prisma = new PrismaClient();

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured in the .env');
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    throw res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

    // Finds the user and selects the id and the role (maybe?)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw res.status(401).json({ message: "User not found" });
    }

    // Assigns the user role to the request
    req.user = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};