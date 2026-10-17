import { IToken } from "../../src/api/interfaces/IToken.interface"

declare namespace Express {
  interface Request {
    path: string
    user: IToken
  }
}
