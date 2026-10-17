export const formatDateForSQL = (value?: string, isEnd = false): string | null => {
    if (!value) return null;
  
    // Convierte ISO a objeto Date válido
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
  
    // Si es fecha de inicio -> 00:00:00, si es fin -> 23:59:59
    if (isEnd) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
  
    // Formato MySQL (YYYY-MM-DD HH:mm:ss)
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };