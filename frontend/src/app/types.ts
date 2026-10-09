export interface PollingRow {
  category: string,
  name: string,
  order: number,
  price: number,
  status: string
}

export interface OrderRequest {
  order_id: string,
  order_source: string,
  status: string,
  restaurant: string,
  first_name: string,
  last_name: string,
  total: number,
  items: string,
  notes: string,
  tomorrow: boolean,
  meal: string
}
