CREATE TABLE public.direct_orders (
    invoice_number TEXT PRIMARY KEY,
    cin7_id TEXT UNIQUE,
    order_date DATE,
    store TEXT REFERENCES public.master_store_list (store),
    order_notes TEXT,
    order_value NUMERIC(12, 2),
    dispatch_date DATE,
    invoice_date DATE,
    cin7_status TEXT,
    rsr TEXT
);

