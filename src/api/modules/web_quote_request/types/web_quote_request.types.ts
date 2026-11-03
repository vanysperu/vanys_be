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

export interface WebQuoteItemInput {
  sku: string;
  quantity: number;
}

export interface WebQuoteRequestInput {
  client: WebQuoteClientInput;
  items: WebQuoteItemInput[];
}

export interface WebQuoteAddedItem {
  sku: string;
  product_id: number;
  product_name: string;
  quantity: number;
}

// SKU que la web mandó y no corresponde a ningún producto activo de la
// empresa: no entra a la cotización y se avisa al equipo.
export interface WebQuoteMissingItem {
  sku: string;
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
