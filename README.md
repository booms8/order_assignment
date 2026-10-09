# Mock Order Service
Prerequisites:
Python 3
Node
Angular CLI

In the backend directory:
1. Run `pip install fastapi contextlib pydantic` to get the required external python libraries.
2. Run `python3 -m uvicorn backend:api --reload` to start the API.

In the frontend directory:
1. Run `npm install` to install all necessary packages.
2. run `ng serve` to start the frontend.

Navigate to http://localhost:4200 in any browser to see the dashboard. Click any of the "Start mocks" buttons or use the file picker to upload a CSV file to simulate orders arriving from different sources.

To reset the system, stop both processes, delete the `backend.db` in the backend directory, and start both processes again.

## Endpoints
`GET http://localhost:8000/api/orders`  
Returns all orders currently in the database

`GET http://localhost:8000/api/orders/{order}`  
Returns all versions of a specific order

`GET http://localhost:8000/api/orders/status/{status}`  
Returns all orders matching the string passed in {status}, or all orders in the "dispatched" state if the status is "dispatched"

`GET http://localhost:8000/api/orders/restaurant/{restaurant}`  
Returns all orders from the specified restaurant

`GET http://localhost:8000/api/orders/source/{source}`  
Returns all orders placed from the specified source

`POST http://localhost:8000/api/orders`  
Inserts an order into the Database

`POST http://localhost:8000/api/orders/webhook`  
Accepts and inserts orders in the format accepted by the webhook

`POST http://localhost:8000/api/orders/batch`  
Accepts and inserts an array of orders

## TODOs
Improved frontend:
- Better display model for simple and detailed order views
- Graphs/fancier visualizations
- Frontend filters for large datasets

Backend:
- ORM database for more detailed storage of data

Code cleanup/improvement:
- Move some duplicated code into functions (frontend and backend)
