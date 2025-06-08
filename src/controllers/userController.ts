import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

export const getEventOrganizerProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    const organizer = await prisma.user.findUnique({
      where: {
        id: id,
      },
      select: {
        name: true,
        organizedEvents: {
          select: {
            name: true,
            reviews: {
              select: {
                rating: true,
                comment: true,
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!organizer) {
      res.status(404).json({ message: "Event organizer not found" });
      return;
    }

    const allReviews = organizer.organizedEvents.flatMap(
      ({ name: eventName, reviews }) =>
        reviews.map(({ rating, comment, user }) => ({
          rating,
          comment,
          eventName,
          reviewedBy: user.name,
        }))
    );

    const totalRating = allReviews.reduce(
      (sum, review) => sum + review.rating,
      0
    );
    const overallRating =
      allReviews.length > 0 ? totalRating / allReviews.length : 0;

    res.status(200).json({
      name: organizer.name,
      overallRating,
      reviews: allReviews,
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const updateUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { name, email, password } = req.body;

    const updateData: any = {};

    if (name) {
      updateData.name = name;
    }

    if (email) {
      updateData.email = email;
    }

    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        name: true,
        email: true,
      },
    });

    res.status(200).json({
      message: "User profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};
