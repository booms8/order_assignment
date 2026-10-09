from fastapi import APIRouter, FastAPI, HTTPException
from contextlib import asynccontextmanager
from pydantic import BaseModel

import sqlite3
import json
import time
import hashlib

# Stadard models for validation
class OrderWebhook(BaseModel):
    order_id: str
    order_source: str
    restaurant: str
    first_name: str
    last_name: str
    total: float
    items: list[str]
    notes: str

class OrderRequest(BaseModel):
    order_id: str
    order_source: str
    status: str = "ordered"
    restaurant: str
    first_name: str
    last_name: str
    total: float
    items: str
    notes: str
    tomorrow: bool = False
    meal: str = ""

class OrderResponse(BaseModel):
    id: int
    order_id: str
    order_source: str
    status: str
    restaurant: str
    first_name: str
    last_name: str
    total: float
    items: str
    notes: str
    tomorrow: bool
    meal: str
    dispatched: bool
    timestamp: str

# Standardize database connection creation
def connect_db():
    connection = sqlite3.connect("backend.db", check_same_thread=False)
    mode = connection.execute("PRAGMA journal_mode=WAL;").fetchone()[0]
    if mode != "wal":
        raise RuntimeError("Failed to enabled WAL mode")
    connection.executescript("PRAGMA synchronous = NORMAL;"
        "PRAGMA busy_timeout = 5000;")
    connection.row_factory = sqlite3.Row
    return connection

def sanitize_webhook(order: OrderWebhook):
    items = ", ".join(order.items)
    return OrderRequest(
        order_id = order.order_id,
        order_source = order.order_source,
        restaurant = order.restaurant,
        first_name = order.first_name,
        last_name = order.last_name,
        total = order.total,
        items = items,
        notes = order.notes)

def db_insert(order: OrderRequest, dispatch: bool):
    connection = connect_db()
    db = connection.cursor()
    try:
        time_now = int(time.time())
        db.execute(("INSERT INTO orders ("
            "order_id, "
            "order_source, "
            "status, "
            "restaurant, "
            "first_name, "
            "last_name, "
            "total, "
            "items, "
            "notes,"
            "tomorrow, "
            "meal, "
            "dispatched, "
            "timestamp"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"), (
                order.order_id,
                order.order_source,
                order.status,
                order.restaurant,
                order.first_name,
                order.last_name,
                order.total,
                order.items,
                order.notes,
                order.tomorrow,
                order.meal,
                dispatch,
                time_now
            ))
        connection.commit()
        response_obj = dict(order)
        response_obj["id"] = db.lastrowid
        response_obj["dispatched"] = dispatch
        response_obj["timestamp"] = time_now
        return response_obj
    except Exception as e:
        print(e)
        raise HTTPException(status_code=400, detail="Database error: {e}")
    finally:
        connection.close()

def insert_order(order: OrderRequest, dispatch: bool):
    if (order.order_id == ""):
        # Quick way to make a unique ID from essential parts of the order
        encoded_string = (order.first_name + order.last_name + order.items).encode('utf-8')
        hash_long = hashlib.shake_256(encoded_string)
        order.order_id = hash_long.hexdigest(8)[:16]
    connection = connect_db()
    db = connection.cursor()
    db.execute("SELECT EXISTS(SELECT 1 FROM orders WHERE order_id = ?)", (order.order_id,))
    duplicate = bool(db.fetchone()[0])
    if not duplicate:
        connection.close()
        return db_insert(order, dispatch)
    else:
        db.execute("SELECT "
        "order_id, "
        "order_source, "
        "status, "
        "restaurant, "
        "first_name, "
        "last_name, "
        "total, "
        "items, "
        "notes,"
        "tomorrow, "
        "meal FROM orders WHERE order_id = ?", (order.order_id,))
        row = db.fetchone()
        record = OrderRequest(
            order_id = row[0],
            order_source = row[1],
            status = row[2],
            restaurant = row[3],
            first_name = row[4],
            last_name = row[5],
            total = row[6],
            items = row[7],
            notes = row[8],
            tomorrow = row[9],
            meal = row[10]
        )
        connection.close()
        if (order.first_name == "Rahne"):
            print("New order:", order)
            print("Old order:", record)
        if record == order:
            print("Duplicate order detected")
        else:
            return db_insert(order, dispatch);

def dispatch_order(order: OrderRequest):
    # Wait until polling API orders are in the processed state to dispatch
    if (len(order.order_id) == 4 and order.status == "ordered"):
        return False
    # Don't dispatch delayed orders from CSV upload
    elif (len(order.order_id) != 4 and order.tomorrow):
        return False
    # Dispatch anything else
    else:
        return True



# Handle table creation
@asynccontextmanager
async def lifespan(app: FastAPI):
    connection = connect_db()
    db = connection.cursor()
    db.execute("CREATE TABLE IF NOT EXISTS orders ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "order_id TEXT, "
        "order_source TEXT, "
        "status TEXT DEFAULT 'ordered', "
        "restaurant TEXT, "
        "first_name TEXT, "
        "last_name TEXT, "
        "total DECIMAL(6, 2), "
        "items TEXT, "
        "notes TEXT, "
        "tomorrow BIT, "
        "meal TEXT, "
        "dispatched BIT, "
        "timestamp INTEGER)")
    connection.commit()
    connection.close()
    print("Database ready")
    yield

router = APIRouter(prefix="/api")
api = FastAPI(title="Backend API", lifespan=lifespan)
api.include_router(router)

# Endpoints
@api.post("/orders", response_model=OrderResponse)
def create_order(order: OrderRequest):
    return insert_order(order, True)

@api.post("/orders/webhook", response_model=OrderResponse)
def create_order_webhook(order: OrderWebhook):
    order_db = sanitize_webhook(order)
    return insert_order(order_db, True)

@api.post("/orders/batch", response_model=list[OrderResponse])
def batch_orders(orders: list[OrderRequest]):
    finished_updates: list[OrderResponse] = []
    for order in orders:
        finished_updates.append(insert_order(order, dispatch_order(order)))
    return finished_updates

@api.get("/orders", response_model=list[OrderResponse])
def get_all_orders():
    connection = connect_db()
    db = connection.cursor()
    db.execute("SELECT * FROM orders")
    orders = db.fetchall()
    connection.close()
    print(len(orders), " orders fetched")

    if orders is None:
        raise HTTPException(status_code=404, detail="Data not found")
    return list(map(lambda order: dict(order), orders))

@api.get("/orders/{order}", response_model=list[OrderResponse])
def get_order(order: str):
    connection = connect_db()
    db = connection.cursor()
    db.execute("SELECT * FROM orders WHERE order_id = ? ORDER BY timestamp DESC", (order,))
    orders = db.fetchall()
    connection.close()

    if orders is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return list(map(lambda order: dict(order), orders))

@api.get("/orders/status/{status}", response_model=list[OrderResponse])
def get_order_by_status(status: str):
    connection = connect_db()
    db = connection.cursor()
    if (status == "dispatched"):
        db.execute("SELECT * FROM orders WHERE dispatched = 1 ORDER BY timestamp DESC")
    else:
        db.execute("SELECT * FROM orders WHERE status = ? ORDER BY timestamp DESC", (status,))
    orders = db.fetchall()
    connection.close()
    print("All orders in state '" + status + "' fetched")

    if orders is None:
        raise HTTPException(status_code=400, detail="Status not valid")
    return list(map(lambda order: dict(order), orders))

@api.get("/orders/restaurant/{rest}", response_model=list[OrderResponse])
def get_order_by_restaurant(rest: str):
    connection = connect_db()
    db = connection.cursor()
    db.execute("SELECT * FROM orders WHERE restaurant = ? ORDER BY timestamp DESC", (rest,))
    orders = db.fetchall()
    connection.close()
    print("All orders from restaurant '" + rest + "' fetched")

    if orders is None:
        raise HTTPException(status_code=400, detail="Restaurant not valid")
    return list(map(lambda order: dict(order), orders))

@api.get("/orders/source/{source}", response_model=list[OrderResponse])
def get_order_by_source(source: str):
    connection = connect_db()
    db = connection.cursor()
    db.execute("SELECT * FROM orders WHERE order_source = ? ORDER BY timestamp DESC", (source,))
    orders = db.fetchall()
    connection.close()
    print("All orders from '" + source + "' fetched")

    if orders is None:
        raise HTTPException(status_code=400, detail="Source not valid")
    return list(map(lambda order: dict(order), orders))






# MOCK FOR EXTERNAL API
external_call_count = 0
with open('./mocks/api_responses.json', 'r', encoding='utf-8') as file:
    data = json.load(file)

@api.get("/external/{time_since}")
def get_external_orders(time_since: str):
    print("Fetching updates since ", time_since)
    if data is None or len(data) == 0:
        raise HTTPException(status_code=500, detail="Error loading JSON data")
    global external_call_count
    if external_call_count >= len(data):
        raise HTTPException(status_code=404, detail="No more JSON data is available")
    response = data[external_call_count]
    if response["response"] != 200:
        external_call_count += 1
        raise HTTPException(status_code=response["response"], detail=response["error"])
    external_call_count += 1
    return response
