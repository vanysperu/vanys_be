import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * Lectura directa a la base, SOLO para verificar efectos que la API no
 * expone por ningún endpoint.
 *
 * Caso concreto: el módulo `logs` existe y escribe, pero su router nunca se
 * montó en index.server.ts, así que no hay forma de leer el historial por
 * HTTP. Para comprobar que la trazabilidad de caja realmente quedó
 * registrada, el test consulta la tabla. Todo lo demás se prueba por la API,
 * como el resto de la suite.
 */
export async function queryRows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const connection = await mysql.createConnection({
    host: process.env.PROY_BD_HOST,
    port: Number(process.env.PROY_BD_PORT),
    user: process.env.PROY_BD_USER,
    password: process.env.PROY_BD_PASS,
    database: process.env.PROY_BD,
  });

  try {
    const [rows] = await connection.query(sql, params);
    return rows as T[];
  } finally {
    await connection.end();
  }
}
