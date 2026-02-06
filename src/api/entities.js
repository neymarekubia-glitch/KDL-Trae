import { createEntityApi } from './apiClient';

export const Customer = createEntityApi('customers');

export const Vehicle = createEntityApi('vehicles');

export const ServiceItem = createEntityApi('service-items');

export const Quote = createEntityApi('quotes');
Quote.approve = async (id, options) => {
  if (!id) throw new Error('approve requires a valid quote id');
  return apiClient.request('POST', '/quotes/approve', { body: { quote_id: id }, ...(options || {}) });
};

export const QuoteItem = createEntityApi('quote-items');

export const MaintenanceReminder = createEntityApi('maintenance-reminders');

export const Supplier = createEntityApi('suppliers');

export const StockMovement = createEntityApi('stock-movements');

export const ServiceOrder = createEntityApi('service-orders');

export const VehicleMileageHistory = createEntityApi('vehicle-mileage-history');

export const Tenant = createEntityApi('tenants');
