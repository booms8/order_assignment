import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Order {
  id: number;
  orderId: string;
  orderSource: string;
  status: string;
  restaurant: string;
  firstName: string;
  lastName: string;
  total: number;
  items: string;
  notes: string;
  tomorrow: boolean;
  meal: string;
}

@Injectable({
  providedIn: 'root',
})
export class Api {
  private http = inject(HttpClient);
  private url = '/api';

  getAllOrders(): Observable<any[]> {
    return this.http.get<any[]>(this.url + "/orders");
  }

  getOrdersByStatus(status: string): Observable<any[]> {
    return this.http.get<any[]>(this.url + "/orders/status/" + status);
  }

  getOrderDetails(order: string): Observable<any[]> {
    return this.http.get<any[]>(this.url + "/orders/" + order);
  }

  pollingApi(timeSince: string): Observable<any> {
    return this.http.get<any>(this.url + "/external/" + timeSince);
  }

  webhookOrder(newOrder: any): Observable<any> {
    return this.http.post(this.url + "/orders/webhook", newOrder);
  }

  batchOrders(orders: any[]): Observable<any> {
    return this.http.post(this.url + "/orders/batch", orders);
  }
}
