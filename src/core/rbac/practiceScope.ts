// Modo enseñanza (21-nov): las empresas de práctica (company.is_practice) son
// empresas normales para el aislamiento, pero no deben mezclarse con las
// reales cuando el Super Administrador mira "todas las empresas" (estadísticas
// de plataforma, Caja sin empresa elegida, listas de empresas y tiendas).
//
// Fragmento SQL para los listados con `:companyId` opcional: si hay empresa
// elegida no cambia nada (ya filtra por ella); si no, saca las de práctica.
export const excludePracticeCompaniesSql = (companyColumn: string): string =>
  `(:companyId IS NOT NULL OR ${companyColumn} NOT IN (SELECT practice_company.id FROM company practice_company WHERE practice_company.is_practice = true))`;
