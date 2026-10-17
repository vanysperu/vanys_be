import jwt from "jsonwebtoken";
import config from "../config/environments";

export interface JwtPayload {
  _key: string;
  _userId: number;
  _roles: number[];
}

export const generateJWT = (payload: JwtPayload): Promise<string> => {
  return new Promise((resolve, reject) => {
    jwt.sign(payload, config.SECRET_HIDDEN_KEY!, (err, token) => {
      if (!err) {
        if (!token) {
          return reject(new Error("Undefined Token"));
        }

        return resolve(token);
      }

      return reject(err);
    });
  });
};
