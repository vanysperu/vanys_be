import { LoginStatus } from "./loginStatus";


const USER_DEFAULT_VALUES = Object.freeze({

    LOGIN_STATUS: LoginStatus.H,
    FAILED_ATTEMPTS: 0

  } as const);

export {
    USER_DEFAULT_VALUES,
}


