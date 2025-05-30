// src/middleware/asyncHandler.ts
import { type Request,type  Response, type NextFunction } from "express";

import { clerkClient } from "@clerk/express";
import { prismaClient } from "db";
import jwt from "jsonwebtoken";

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err.message, err.stack);
  
  // Determine status code
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  
  // Send error response
  res.status(statusCode).json({
    error: err.message || "An unexpected error occurred",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
};



declare global {
    namespace Express {
      interface Request {
        userId?: string;
        user?: {
          email: string;
        };
        openAIKey?:string
      }
    }
  }

  export class AuthMiddleware {
    /**
     * Authenticate user and extract user information
     */
    static async authenticateUser(req: Request, res: Response, next: NextFunction) {
      const authHeader = req.headers["authorization"];
      const token = authHeader?.split(" ")[1];
  
      if (!token) {
        return res.status(401).json({ message: "No authentication token provided" });
      }
  
      try {
        // Verify JWT token
      
        const formattedKey = (process.env.AUTH_JWT_KEY)!.replace(/\\n/g, "\n");
        
        const decoded = jwt.verify(token, formattedKey, {
          algorithms: ['RS256'],
          complete: true,
        });
       
        const userId = (decoded as any).payload.sub;
        if (!userId) {
          return res.status(403).json({ message: "Invalid token payload" });
        }
  
        // Fetch user from Clerk
        const user = await clerkClient.users.getUser(userId);
        const primaryEmail = user.emailAddresses.find(
          (email) => email.id === user.primaryEmailAddressId
        );
  
        if (!primaryEmail) {
          return res.status(400).json({ message: "User email not found" });
        }
  
        // Attach user information to request
        //console.log(userId)
        req.userId = userId;
        req.user = {
          email: primaryEmail.emailAddress
        };  
        next();
      } catch (error) {
        console.error("Authentication error:", error);
        return res.status(403).json({ message: "Authentication failed" });
      }
    }

    static async getOpenAIKey(req: Request, res: Response, next: NextFunction){
      try {
        // Ensure user is authenticated first
        if (!req.userId) {
          return res.status(401).json({ error: 'User not authenticated' });
        }
        //console.log(req.userId)
        // Fetch the user's OpenAI key
        const user = await prismaClient.user.findUnique({
          where: { userId: req.userId as string },
          select: { openAIKey: true }
        });
        //console.log(user)
    
        if (!user || !user.openAIKey) {
          return res.status(403).json({ 
            error: 'OpenAI API key is required. Please configure your OpenAI key first.' 
          });
        }
    
        // Attach OpenAI key to the request
        req.openAIKey = user.openAIKey;
        
        next();
      } catch (error) {
        console.error('OpenAI key retrieval error:', error);
        res.status(500).json({ error: 'Error retrieving OpenAI key' });
      }
    };
  }