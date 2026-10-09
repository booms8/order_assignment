import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Subscription, of, timer } from 'rxjs';
import { catchError, delayWhen, switchMap } from 'rxjs/operators';
import * as Papa from 'papaparse';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { Api, Order } from './services/api';
import { PollingRow, OrderRequest } from './types';
import data from './webhook_orders.json';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatButtonModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('frontend');
  private api = inject(Api);
  private apiSubscription!: Subscription;
  private webhookSubscription!: Subscription;
  private pollingApiSubscription!: Subscription;
  private orderDetailsSubscription!: Subscription;

  loading = signal(true);
  loadingDetails = signal(true);
  webhookRunning = false;
  pollingApiRunning = false;
  orders: any[] = [];
  csvOrders: any[] = [];
  orderDetails: any[] = [];
  webhookData: any[] = data;

  lastCsv: File | null = null;

  constructor(private cdr: ChangeDetectorRef) {}
  update() {
    this.cdr.detectChanges();
  }

  ngOnInit() {
    //Poll our overall list of orders every 5s
    // this.apiSubscription = timer(0, 5000).pipe(
    //   switchMap(() => this.api.getAllOrders())
    // ).subscribe({
    //   next: (orders) => {
    //     this.loading.set(true);
    //     this.orders = orders;
    //     this.loading.set(false);
    //   },
    //   error: (error) => console.error("Failed to retrieve orders", error)
    // });
  }

  ngOnDestroy() {
    if (this.apiSubscription)
      this.apiSubscription.unsubscribe();
    if (this.orderDetailsSubscription)
      this.orderDetailsSubscription.unsubscribe();
    if (this.webhookSubscription)
      this.webhookSubscription.unsubscribe();
    if (this.pollingApiSubscription)
      this.pollingApiSubscription.unsubscribe();
  }

  togglePollingApiMock() {
    if (!this.pollingApiRunning) {
      this.pollingApiRunning = true;
      this.simulatePollingApi()
    } else {
      this.pollingApiSubscription.unsubscribe();
      this.pollingApiRunning = false;
    }
  }

  simulatePollingApi() {
    this.pollingApiSubscription = timer(0, 30000).pipe(
      switchMap(() => this.api.pollingApi("30s").pipe(
        catchError(error => {
          //Handle errors within pipe so the subscription doesn't end if we hit an error
          if (error.status == 404) {
            this.pollingApiSubscription.unsubscribe();
            this.pollingApiRunning = false;
          }
          console.error("Polling API error caught safely:", error);
          return of(null);
        })
      ))
    ).subscribe({
      next: (response) => {
        if (response && Object.keys(response.data).length > 0) {
          let flattenedData = this.processPollingData(response.data);
          console.log("Batch orders:", flattenedData);
          this.saveBatchOrders(flattenedData);
        } else
          console.log("No new data received from polling API");
      },
      error: (error) => console.error("Failed to fetch updates from polling API", error)
    });
  }

  processPollingData(data: any) {
    let rows = Object.values(data);
    return Array.from(
      (rows as PollingRow[]).reduce((map, row) => {
        if (map.has(row.order)) {
          let order = map.get(row.order);
          order.total += row.price;
          order.items += (", " + row.name);
          order.meal += (", " + row.category)
        } else
          map.set(row.order, {
            order_id: row.order,
            order_source: "",
            status: row.status,
            restaurant: "",
            first_name: "",
            last_name: "",
            total: Math.round(row.price * 100) / 100,
            items: row.name,
            notes: "",
            tomorrow: false,
            meal: row.category
          });
        return map;
      }, new Map<number, any>()).values()
    );
  }

  saveBatchOrders(orders: any[]) {
    this.api.batchOrders(orders).subscribe({
      next: (response) => console.log(response),
      error: (error) => console.error("Batch update failed:", error)
    })
  }

  onCsvLoad(event: Event) {
    const input = event.target as HTMLInputElement;

    if (input.files && input.files.length > 0) {
      this.lastCsv = input.files[0];

      if (this.lastCsv.type !== "text/csv" && !this.lastCsv.name.endsWith
        (".csv")) {
        console.error("Selected file is not a valid CSV file");
        return;
      }

      Papa.parse(this.lastCsv, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => this.handleCsvData(result.data),
        error: (error) => console.error("Error parsing CSV file:", error)
      });
    }
  }

  handleCsvData(data: any[]) {
    let newOrders: OrderRequest[] = []
    data.forEach((order) => {
      let sanitizedOrder = {
        order_id: "",
        order_source: "",
        status: "ordered",
        restaurant: "",
        first_name: order.first_name,
        last_name: order.last_name,
        total: 0,
        items: order.items,
        notes: order.notes,
        tomorrow: order.tomorrow == "true",
        meal: order.meal
      }
      if (!this.csvOrders.find(oldOrder =>
        oldOrder.first_name == order.first_name &&
        oldOrder.last_name == order.last_name &&
        oldOrder.items == order.items)) {
        this.csvOrders.push(sanitizedOrder);
        newOrders.push(sanitizedOrder);
      }
    });
    this.saveBatchOrders(newOrders);
  }

  statusSelectionChanged(value: string) {
    if (this.apiSubscription)
      this.apiSubscription.unsubscribe();
    this.orders = [];

    if (!value)
      this.apiSubscription.unsubscribe();

    this.apiSubscription = timer(0, 5000).pipe(
      switchMap(() => this.api.getOrdersByStatus(value))
    ).subscribe({
      next: (orders) => {
        this.loading.set(true);
        this.orders = orders;
        this.loading.set(false);
      },
      error: (error) => console.error("Failed to retrieve orders", error)
    });
  }

  showDispatchedChanged() {
    if (this.apiSubscription)
      this.apiSubscription.unsubscribe();
    this.orders = [];

    this.apiSubscription = timer(0, 5000).pipe(
      switchMap(() => this.api.getOrdersByStatus("dispatched"))
    ).subscribe({
      next: (orders) => {
        this.loading.set(true);
        this.orders = orders;
        this.loading.set(false);
      },
      error: (error) => console.error("Failed to retrieve orders", error)
    });
  }

  getOrderDetails(order: string) {
    if (this.orderDetailsSubscription)
      this.orderDetailsSubscription.unsubscribe();
    this.orderDetails = [];

    this.orderDetailsSubscription = timer(0, 5000).pipe(
      switchMap(() => this.api.getOrderDetails(order))
    ).subscribe({
      next: (orders) =>  {
        this.orderDetails = orders;
        this.update();
      },
      error: (error) => console.error("Failed to retrieve orders", error)
    });
  }






  //MOCK FOR WEBHOOK ORDERS
  toggleWebhookMocks() {
    if (!this.webhookRunning) {
      this.webhookRunning = true;
      this.simulateWebhookOrders();
    } else {
      this.webhookSubscription.unsubscribe();
      this.webhookRunning = false;
    }
  }

  simulateWebhookOrders() {
    let requestIndex = this.orders.length;

    this.webhookSubscription = timer(0, 4000).pipe(
      switchMap(() => this.api.webhookOrder(this.webhookData[requestIndex]).pipe(
        catchError(error => {
          //Handle errors within pipe so the subscription doesn't end if we hit an error
          console.error("API error caught safely:", error);
          return of(null);
        })
      ))
    ).subscribe({
      next: (order) => requestIndex++,
      error: (error) => console.error("Failed to create webhook order", error)
    });
  }
}
