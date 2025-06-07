import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";

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
