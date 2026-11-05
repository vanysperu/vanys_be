// Body de POST /public/quotation-request (lo manda la web de la empresa).
// Solo el celular del cliente es obligatorio; el resto de sus datos es
// opcional y se usa únicamente si hay que crear el cliente.
export interface WebQuoteClientInput {
  phone: string;
  name?: string | null;
  email?: string | null;
  document_type?: string | number | null;
  document_number?: string | null;
  address?: string | null;
}

// Cada item se identifica por `code` o por `sku`. El código de proveedor es
// único en la empresa y ya dice producto y color; `color` sirve para productos
// con un solo código para todos sus colores.
export interface WebQuoteItemInput {
  sku?: string | null;
  code?: string | null;
  color?: string | null;
  quantity: number;
}

export interface WebQuoteRequestInput {
  client: WebQuoteClientInput;
  items: WebQuoteItemInput[];
}

export interface WebQuoteAddedItem {
  sku: string | null;
  code: string | null;
  color: string | null;
  product_id: number;
  product_name: string;
  quantity: number;
}

// SKU o código que la web mandó y no corresponde a ningún producto activo de
// la empresa: no entra a la cotización y se avisa al equipo.
export interface WebQuoteMissingItem {
  sku: string | null;
  code: string | null;
  quantity: number;
}

export interface WebQuoteRequestResult {
  quotation_id: number;
  status: "quote_requested";
  client_id: number;
  client_created: boolean;
  items_added: WebQuoteAddedItem[];
  missing_items: WebQuoteMissingItem[];
  // Datos opcionales del cliente que no se guardaron (ej. un email que ya
  // usa otro cliente de la empresa): el pedido no se rechaza por eso.
  warnings: string[];
}
