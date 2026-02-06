import { createEntityApi } from './apiClient';

export const Customer = createEntityApi('customers');

export const Vehicle = createEntityApi('vehicles');

export const ServiceItem = createEntityApi('service-items');

export const Quote = createEntityApi('quotes');

export const QuoteItem = createEntityApi('quote-items');

export const MaintenanceReminder = createEntityApi('maintenance-reminders');

export const Supplier = createEntityApi('suppliers');

export const StockMovement = createEntityApi('stock-movements');

export const ServiceOrder = createEntityApi('service-orders');

export const VehicleMileageHistory = createEntityApi('vehicle-mileage-history');

export const Tenant = createEntityApi('tenants');