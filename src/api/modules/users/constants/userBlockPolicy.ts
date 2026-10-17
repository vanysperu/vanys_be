
const USER_BLOCK_POLICY = Object.freeze({

    /**
     * Número mínimo de minutos que un usuario puede estar bloqueado.
     */
    MIN_BLOCKED_MINUTES: 10,

    /**
     * Número máximo de intentos antes de bloquear al usuario.
     */
    MAX_ATTEMPTS: 3,               
    
  } as const);

export {
    USER_BLOCK_POLICY
}
