-- ============================================================
-- INSERT allowed_operations
-- Módulos de referencia (tabla module):
--   id=1  Usuarios
--   id=2  Super Configuracion (roles, config, sistema)
--   id=3  Administracion (clientes, servicios, inventario, finanzas)
-- Nota: las rutas existentes en el seeder (id 1-11) se omiten.
-- ============================================================

INSERT IGNORE INTO `allowed_operations`
  (`id`, `route`, `verb`, `name`, `description`, `module_id`, `created_date`)
VALUES

-- ==================== AUTH ====================
(12,  '/signin',                          'POST',  'Iniciar sesión',                          'Autenticación de usuario',                             NULL, NOW()),
(13,  '/signout',                         'POST',  'Cerrar sesión',                           'Cierre de sesión del usuario',                         NULL, NOW()),
(14,  '/recovery/send-code',              'POST',  'Enviar código de recuperación',           'Envía código para recuperar contraseña',               NULL, NOW()),
(15,  '/recovery/verify-code',            'POST',  'Verificar código de recuperación',        'Verifica el código de recuperación de contraseña',     NULL, NOW()),
(16,  '/recovery/user-account',           'POST',  'Recuperar cuenta de usuario',             'Restablece la contraseña del usuario',                 NULL, NOW()),

-- ==================== USER (module_id=1) ====================
(17,  '/user/batch/disable',              'PUT',   'Desactivar usuarios en lote',             'Desactivar múltiples usuarios',                        1,    NOW()),
(18,  '/user/change/password',            'PATCH', 'Cambiar contraseña',                      'Cambiar la contraseña del usuario autenticado',        1,    NOW()),

-- ==================== ROLE (module_id=2) ====================
(19,  '/role/list',                       'GET',   'Listar roles',                            'Listar todos los roles paginado',                      2,    NOW()),
(20,  '/role/create',                     'POST',  'Crear rol',                               'Crear un nuevo rol',                                   2,    NOW()),
(21,  '/role/update/*',                   'PUT',   'Actualizar rol',                          'Actualizar datos de un rol',                           2,    NOW()),
(22,  '/role/disable/*',                  'PUT',   'Desactivar rol',                          'Activar o desactivar un rol',                          2,    NOW()),

-- ==================== ROLE_MODULE (module_id=2) ====================
(23,  '/role_module/list/operations/role/*', 'GET','Listar operaciones por rol',              'Obtener módulos y operaciones asignados a un rol',     2,    NOW()),
(24,  '/role_module/list/my-modules',     'GET',   'Listar mis módulos',                      'Obtener módulos del usuario autenticado',              2,    NOW()),
(25,  '/role_module/set/permissions/role','POST',  'Asignar permisos a rol',                  'Configurar permisos de operaciones para un rol',       2,    NOW()),

-- ==================== MODULES / VIEW ROUTES (module_id=2) ====================
(26,  '/modules/me',                      'GET',   'Obtener mis módulos de vista',            'Obtener módulos de navegación del usuario actual',     2,    NOW()),
(27,  '/modules/roles/modules',           'POST',  'Agregar módulo a rol',                    'Asignar un módulo de vista a un rol',                  2,    NOW()),

-- ==================== CLIENT (module_id=3) ====================
(28,  '/client/client-account',           'GET',   'Cuenta del cliente',                      'Obtener información de la cuenta del cliente',         3,    NOW()),
(29,  '/client/create',                   'POST',  'Crear cliente',                           'Registrar un nuevo cliente',                           3,    NOW()),
(30,  '/client/update/*',                 'PUT',   'Actualizar cliente',                      'Actualizar datos de un cliente',                       3,    NOW()),
(31,  '/client/find/*',                   'GET',   'Obtener cliente',                         'Obtener información de un cliente por ID',             3,    NOW()),
(32,  '/client/list',                     'GET',   'Listar clientes',                         'Listar todos los clientes paginado',                   3,    NOW()),
(33,  '/client/disable/*',                'PUT',   'Desactivar cliente',                      'Activar o desactivar un cliente',                      3,    NOW()),
(34,  '/client/batch/disable',            'PUT',   'Desactivar clientes en lote',             'Desactivar múltiples clientes',                        3,    NOW()),
(35,  '/client/toggle/vip/*',             'PUT',   'Alternar estado VIP',                     'Activar o desactivar estado VIP de un cliente',        3,    NOW()),

-- ==================== SERVICE (module_id=3) ====================
(36,  '/service/service-account',         'GET',   'Cuenta de servicio',                      'Obtener información de la cuenta de servicio',         3,    NOW()),
(37,  '/service/create',                  'POST',  'Crear servicio',                          'Registrar un nuevo servicio',                          3,    NOW()),
(38,  '/service/update/*',                'PUT',   'Actualizar servicio',                     'Actualizar datos de un servicio',                      3,    NOW()),
(39,  '/service/find/*',                  'GET',   'Obtener servicio',                        'Obtener información de un servicio por ID',            3,    NOW()),
(40,  '/service/list',                    'GET',   'Listar servicios',                        'Listar todos los servicios paginado',                  3,    NOW()),
(41,  '/service/disable/*',               'PUT',   'Desactivar servicio',                     'Activar o desactivar un servicio',                     3,    NOW()),
(42,  '/service/batch/disable',           'PUT',   'Desactivar servicios en lote',            'Desactivar múltiples servicios',                       3,    NOW()),
(43,  '/service/with-prices',             'GET',   'Servicios con precios',                   'Obtener servicios con información de precios',         3,    NOW()),

-- ==================== EQUIPMENT (module_id=3) ====================
(44,  '/equipment/create',                'POST',  'Crear equipo',                            'Registrar un nuevo equipo',                            3,    NOW()),
(45,  '/equipment/update/*',              'PUT',   'Actualizar equipo',                       'Actualizar datos de un equipo',                        3,    NOW()),
(46,  '/equipment/find/*',                'GET',   'Obtener equipo',                          'Obtener información de un equipo por ID',              3,    NOW()),
(47,  '/equipment/list',                  'GET',   'Listar equipos',                          'Listar todos los equipos paginado',                    3,    NOW()),
(48,  '/equipment/disable/*',             'PUT',   'Desactivar equipo',                       'Activar o desactivar un equipo',                       3,    NOW()),
(49,  '/equipment/batch/disable',         'PUT',   'Desactivar equipos en lote',              'Desactivar múltiples equipos',                         3,    NOW()),

-- ==================== NOTIFICATION (module_id=2) ====================
(50,  '/notification/create',             'POST',  'Crear notificación',                      'Crear una nueva notificación',                         2,    NOW()),
(51,  '/notification/find/*',             'GET',   'Obtener notificación',                    'Obtener una notificación por ID',                      2,    NOW()),
(52,  '/notification/list',               'GET',   'Listar notificaciones',                   'Listar notificaciones paginado',                       2,    NOW()),
(53,  '/notification/sse',                'GET',   'Notificaciones en tiempo real',           'Suscripción SSE para notificaciones en tiempo real',   2,    NOW()),
(54,  '/notification/mark-read/*',        'PUT',   'Marcar notificación como leída',          'Marcar una notificación como leída',                   2,    NOW()),
(55,  '/notification/mark-multiple-read', 'PUT',   'Marcar notificaciones como leídas',       'Marcar múltiples notificaciones como leídas',          2,    NOW()),
(56,  '/notification/read-stats/*',       'GET',   'Estadísticas de lectura',                 'Obtener estadísticas de lectura de notificaciones',    2,    NOW()),

-- ==================== PRODUCT (module_id=3) ====================
(57,  '/product/create',                  'POST',  'Crear producto',                          'Registrar un nuevo producto',                          3,    NOW()),
(58,  '/product/update/*',                'PUT',   'Actualizar producto',                     'Actualizar datos de un producto',                      3,    NOW()),
(59,  '/product/find/*',                  'GET',   'Obtener producto',                        'Obtener información de un producto por ID',            3,    NOW()),
(60,  '/product/list',                    'GET',   'Listar productos',                        'Listar todos los productos paginado',                  3,    NOW()),
(61,  '/product/disable/*',               'PUT',   'Desactivar producto',                     'Activar o desactivar un producto',                     3,    NOW()),
(62,  '/product/batch/disable',           'PUT',   'Desactivar productos en lote',            'Desactivar múltiples productos',                       3,    NOW()),
(63,  '/product/with-prices',             'GET',   'Productos con precios',                   'Obtener productos con información de precios',         3,    NOW()),

-- ==================== SUPPLIER (module_id=3) ====================
(64,  '/supplier/supplier-account',       'GET',   'Cuenta de proveedor',                     'Obtener información de la cuenta del proveedor',       3,    NOW()),
(65,  '/supplier/create',                 'POST',  'Crear proveedor',                         'Registrar un nuevo proveedor',                         3,    NOW()),
(66,  '/supplier/update/*',               'PUT',   'Actualizar proveedor',                    'Actualizar datos de un proveedor',                     3,    NOW()),
(67,  '/supplier/find/*',                 'GET',   'Obtener proveedor',                       'Obtener información de un proveedor por ID',           3,    NOW()),
(68,  '/supplier/list',                   'GET',   'Listar proveedores',                      'Listar todos los proveedores paginado',                3,    NOW()),
(69,  '/supplier/all-active',             'GET',   'Proveedores activos',                     'Obtener todos los proveedores activos',                3,    NOW()),
(70,  '/supplier/disable/*',              'PUT',   'Desactivar proveedor',                    'Activar o desactivar un proveedor',                    3,    NOW()),
(71,  '/supplier/batch/disable',          'PUT',   'Desactivar proveedores en lote',          'Desactivar múltiples proveedores',                     3,    NOW()),

-- ==================== INVENTORY (module_id=3) ====================
(72,  '/inventory/registro-documento-manual',  'POST', 'Registrar documento manual',         'Registrar un documento de inventario manualmente',     3,    NOW()),
(73,  '/inventory/registro-inventario',        'POST', 'Registrar inventario',               'Registrar un movimiento de inventario',                3,    NOW()),
(74,  '/inventory/registro-inventarios',       'POST', 'Registrar inventarios en lote',      'Registrar múltiples movimientos de inventario',        3,    NOW()),
(75,  '/inventory/find/*',                     'GET',  'Obtener inventario',                 'Obtener un registro de inventario por ID',             3,    NOW()),
(76,  '/inventory/reporte-kardex',             'GET',  'Reporte kardex',                     'Generar reporte kardex de inventario',                 3,    NOW()),
(77,  '/inventory/getAll',                     'GET',  'Listar inventarios',                 'Listar todos los movimientos de inventario',           3,    NOW()),
(78,  '/inventory/getAll/export',              'GET',  'Exportar inventarios',               'Exportar inventario a Excel',                          3,    NOW()),
(79,  '/inventory/getTipoDocumento',           'GET',  'Obtener tipos de documento',         'Obtener catálogo de tipos de documento',               3,    NOW()),
(80,  '/inventory/getTipoOperacion',           'GET',  'Obtener tipos de operación',         'Obtener catálogo de tipos de operación',               3,    NOW()),
(81,  '/inventory/getTipoOrigen',              'GET',  'Obtener tipos de origen',            'Obtener catálogo de tipos de origen',                  3,    NOW()),
(82,  '/inventory/getProducts',                'POST', 'Obtener productos con precios',       'Obtener productos con precios de inventario',          3,    NOW()),
(83,  '/inventory/disable-inventory/*',        'PUT',  'Desactivar inventario',              'Activar o desactivar un registro de inventario',       3,    NOW()),
(84,  '/inventory/disable-inventories',        'PUT',  'Desactivar inventarios en lote',     'Desactivar múltiples registros de inventario',         3,    NOW()),
(85,  '/inventory/update/*',                   'PUT',  'Actualizar inventario',              'Actualizar un registro de inventario',                 3,    NOW()),
(86,  '/inventory/cierre-mes/*/*',             'PUT',  'Cierre de mes',                      'Ejecutar cierre de inventario del mes',                3,    NOW()),
(87,  '/inventory/apertura-mes/*/*',           'PUT',  'Apertura de mes',                    'Ejecutar apertura de inventario del mes',              3,    NOW()),
(88,  '/inventory/estado-meses',               'GET',  'Estado de meses',                    'Consultar estado de meses de inventario',              3,    NOW()),
(89,  '/inventory/estado-actual',              'GET',  'Estado actual de inventario',        'Obtener estado actual del inventario',                 3,    NOW()),
(90,  '/inventory/historial',                  'GET',  'Historial de inventario',            'Obtener historial de movimientos de inventario',       3,    NOW()),
(91,  '/inventory/tipo-documento/create',      'POST', 'Crear tipo de documento',            'Registrar un tipo de documento de inventario',         3,    NOW()),
(92,  '/inventory/tipo-documento/update/*',    'PUT',  'Actualizar tipo de documento',       'Actualizar un tipo de documento de inventario',        3,    NOW()),
(93,  '/inventory/tipo-documento/delete/*',    'DELETE','Eliminar tipo de documento',        'Eliminar un tipo de documento de inventario',          3,    NOW()),
(94,  '/inventory/tipo-documento/find/*',      'GET',  'Obtener tipo de documento',          'Obtener un tipo de documento por ID',                  3,    NOW()),
(95,  '/inventory/tipo-documento/list',        'GET',  'Listar tipos de documento',          'Listar tipos de documento de inventario',              3,    NOW()),
(96,  '/inventory/tipo-operacion/create',      'POST', 'Crear tipo de operación',            'Registrar un tipo de operación de inventario',         3,    NOW()),
(97,  '/inventory/tipo-operacion/update/*',    'PUT',  'Actualizar tipo de operación',       'Actualizar un tipo de operación de inventario',        3,    NOW()),
(98,  '/inventory/tipo-operacion/delete/*',    'DELETE','Eliminar tipo de operación',        'Eliminar un tipo de operación de inventario',          3,    NOW()),
(99,  '/inventory/tipo-operacion/find/*',      'GET',  'Obtener tipo de operación',          'Obtener un tipo de operación por ID',                  3,    NOW()),
(100, '/inventory/tipo-operacion/list',        'GET',  'Listar tipos de operación',          'Listar tipos de operación de inventario',              3,    NOW()),
(101, '/inventory/tipo-origen/create',         'POST', 'Crear tipo de origen',               'Registrar un tipo de origen de inventario',            3,    NOW()),
(102, '/inventory/tipo-origen/update/*',       'PUT',  'Actualizar tipo de origen',          'Actualizar un tipo de origen de inventario',           3,    NOW()),
(103, '/inventory/tipo-origen/delete/*',       'DELETE','Eliminar tipo de origen',           'Eliminar un tipo de origen de inventario',             3,    NOW()),
(104, '/inventory/tipo-origen/find/*',         'GET',  'Obtener tipo de origen',             'Obtener un tipo de origen por ID',                     3,    NOW()),
(105, '/inventory/tipo-origen/list',           'GET',  'Listar tipos de origen',             'Listar tipos de origen de inventario',                 3,    NOW()),

-- ==================== SERVICE SHEET (module_id=3) ====================
(106, '/service_sheet/',                  'POST',  'Crear hoja de servicio',                  'Registrar una nueva hoja de servicio',                 3,    NOW()),
(107, '/service_sheet/update/*',          'PUT',   'Actualizar hoja de servicio',             'Actualizar datos de una hoja de servicio',             3,    NOW()),
(108, '/service_sheet/toggle/*',          'PUT',   'Alternar estado hoja de servicio',        'Activar o desactivar una hoja de servicio',            3,    NOW()),
(109, '/service_sheet/bulk-disable',      'PUT',   'Desactivar hojas de servicio en lote',   'Desactivar múltiples hojas de servicio',               3,    NOW()),
(110, '/service_sheet/find/*',            'GET',   'Obtener hoja de servicio',                'Obtener una hoja de servicio por ID',                  3,    NOW()),
(111, '/service_sheet/list',              'GET',   'Listar hojas de servicio',                'Listar hojas de servicio paginado',                    3,    NOW()),
(112, '/service_sheet/list-by-state',     'GET',   'Listar hojas de servicio por estado',    'Listar hojas de servicio filtradas por estado',        3,    NOW()),
(113, '/service_sheet/report/*',          'POST',  'Generar reporte hoja de servicio',        'Generar PDF de una hoja de servicio',                  3,    NOW()),

-- ==================== STORE (module_id=3) ====================
(114, '/store/create',                    'POST',  'Crear almacén',                           'Registrar un nuevo almacén',                           3,    NOW()),
(115, '/store/update/*',                  'PUT',   'Actualizar almacén',                      'Actualizar datos de un almacén',                       3,    NOW()),
(116, '/store/find/*',                    'GET',   'Obtener almacén',                         'Obtener información de un almacén por ID',             3,    NOW()),
(117, '/store/list',                      'GET',   'Listar almacenes',                        'Listar todos los almacenes paginado',                  3,    NOW()),
(118, '/store/disable/*',                 'PUT',   'Desactivar almacén',                      'Activar o desactivar un almacén',                      3,    NOW()),
(119, '/store/batch/disable',             'PUT',   'Desactivar almacenes en lote',            'Desactivar múltiples almacenes',                       3,    NOW()),
(120, '/store/list/select',               'GET',   'Almacenes para selector',                 'Obtener almacenes para dropdown',                      3,    NOW()),
(121, '/store/list/warehouse/select',     'GET',   'Bodegas para selector',                   'Obtener bodegas para dropdown',                        3,    NOW()),

-- ==================== TYPE / VARIABLE UNIFERE (module_id=2) ====================
(122, '/type/',                           'POST',  'Crear tipo',                              'Registrar un nuevo tipo/variable unifere',             2,    NOW()),
(123, '/type/update/*',                   'PUT',   'Actualizar tipo',                         'Actualizar un tipo/variable unifere',                  2,    NOW()),
(124, '/type/list',                       'GET',   'Listar tipos',                            'Listar tipos/variables unifere paginado',              2,    NOW()),
(125, '/type/options',                    'GET',   'Opciones de tipos activos',               'Obtener tipos activos para selección',                 2,    NOW()),
(126, '/type/*',                          'GET',   'Obtener tipo',                            'Obtener un tipo/variable unifere por ID',              2,    NOW()),
(127, '/type/*/toggle',                   'PUT',   'Alternar estado de tipo',                 'Activar o desactivar un tipo/variable unifere',        2,    NOW()),
(128, '/type/batch/disable',              'PUT',   'Desactivar tipos en lote',                'Desactivar múltiples tipos/variables unifere',         2,    NOW()),

-- ==================== CHAT (module_id=3) ====================
(129, '/chats',                           'GET',   'Listar chats',                            'Obtener todos los chats',                              3,    NOW()),
(130, '/chats/*',                         'GET',   'Obtener chat',                            'Obtener un chat por ID',                               3,    NOW()),
(131, '/chats/*/mensajes',                'GET',   'Obtener mensajes del chat',               'Obtener mensajes de un chat',                          3,    NOW()),
(132, '/mensajes/enviar',                 'POST',  'Enviar mensaje',                          'Enviar un mensaje con archivos adjuntos',              3,    NOW()),
(133, '/chats/*',                         'PUT',   'Actualizar estado del chat',              'Actualizar el estado de un chat',                      3,    NOW()),

-- ==================== FILE UPLOAD ====================
(134, '/file-upload/upload',              'POST',  'Subir archivos',                          'Subir uno o más archivos al servidor',                 NULL, NOW()),
(135, '/file-upload/relation',            'POST',  'Crear relación de archivo',               'Asociar un archivo a un registro de otra tabla',       NULL, NOW()),
(136, '/file-upload/relation/*/*',        'GET',   'Obtener archivos por relación',           'Obtener archivos asociados a un registro',             NULL, NOW()),
(137, '/file-upload/*',                   'GET',   'Obtener archivo',                         'Obtener información de un archivo por ID',             NULL, NOW()),
(138, '/file-upload/',                    'GET',   'Listar archivos',                         'Listar archivos con paginación y filtros',             NULL, NOW()),

-- ==================== FINANCE (module_id=3) ====================
(139, '/finance/transaction/create',      'POST',  'Crear transacción',                       'Registrar una nueva transacción financiera',           3,    NOW()),
(140, '/finance/transaction/find/*',      'GET',   'Obtener transacción',                     'Obtener una transacción por ID',                       3,    NOW()),
(141, '/finance/transaction/find',        'GET',   'Listar transacciones',                    'Listar transacciones financieras paginado',            3,    NOW()),
(142, '/finance/transaction/balance',     'GET',   'Obtener balance',                         'Obtener balance financiero',                           3,    NOW()),
(143, '/finance/transaction/update/*',    'PUT',   'Actualizar transacción',                  'Actualizar una transacción financiera',                3,    NOW()),
(144, '/finance/transaction/delete/*',    'DELETE','Eliminar transacción',                    'Eliminar una transacción financiera',                  3,    NOW()),
(145, '/finance/fund/create',             'POST',  'Crear fondo',                             'Registrar un nuevo fondo',                             3,    NOW()),
(146, '/finance/fund/find/*',             'GET',   'Obtener fondo',                           'Obtener un fondo por ID',                              3,    NOW()),
(147, '/finance/fund/find',               'GET',   'Listar fondos',                           'Listar fondos paginado',                               3,    NOW()),
(148, '/finance/fund/total',              'GET',   'Total de fondos',                         'Obtener total acumulado de fondos',                    3,    NOW()),
(149, '/finance/fund/update/*',           'PUT',   'Actualizar fondo',                        'Actualizar un fondo',                                  3,    NOW()),
(150, '/finance/fund/delete/*',           'DELETE','Eliminar fondo',                          'Eliminar un fondo',                                    3,    NOW()),
(151, '/finance/debt/create',             'POST',  'Crear deuda',                             'Registrar una nueva deuda',                            3,    NOW()),
(152, '/finance/debt/find/*',             'GET',   'Obtener deuda',                           'Obtener una deuda por ID',                             3,    NOW()),
(153, '/finance/debt/find',               'GET',   'Listar deudas',                           'Listar deudas paginado',                               3,    NOW()),
(154, '/finance/debt/summary',            'GET',   'Resumen de deudas',                       'Obtener resumen de deudas',                            3,    NOW()),
(155, '/finance/debt/update/*',           'PUT',   'Actualizar deuda',                        'Actualizar una deuda',                                 3,    NOW()),
(156, '/finance/debt/pay/*',              'POST',  'Pagar deuda',                             'Registrar pago de una deuda',                          3,    NOW()),
(157, '/finance/debt/delete/*',           'DELETE','Eliminar deuda',                          'Eliminar una deuda',                                   3,    NOW()),

-- ==================== REPORTS (module_id=3) ====================
(158, '/reports/find/financial',          'GET',   'Reporte financiero',                      'Obtener reporte de ingresos vs egresos',               3,    NOW()),
(159, '/reports/find/sales',              'GET',   'Reporte de ventas',                       'Obtener reporte de hojas de servicio por estado',      3,    NOW()),
(160, '/reports/find/products/top',       'GET',   'Top productos',                           'Obtener reporte de productos más vendidos',            3,    NOW()),
(161, '/reports/find/services/top',       'GET',   'Top servicios',                           'Obtener reporte de servicios más solicitados',         3,    NOW()),
(162, '/reports/find/clients/top',        'GET',   'Top clientes',                            'Obtener reporte de clientes más frecuentes',           3,    NOW()),
(163, '/reports/find/inventory',          'GET',   'Reporte de inventario',                   'Obtener reporte general de inventario',                3,    NOW()),

-- ==================== LOGS (module_id=2) ====================
(164, '/logs/list',                       'GET',   'Listar logs',                             'Listar registros de auditoría paginado',               2,    NOW());
