import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import Customers from "./Customers";

import Vehicles from "./Vehicles";

import ServiceCatalog from "./ServiceCatalog";

import Quotes from "./Quotes";

import NewQuote from "./NewQuote";

import QuoteDetail from "./QuoteDetail";

import ServiceOrders from "./ServiceOrders";

import Suppliers from "./Suppliers";

import VehicleHistory from "./VehicleHistory";

import VehicleSearch from "./VehicleSearch";

import PendingPayments from "./PendingPayments";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import Login from './Login.jsx';
import { useAuth } from '@/hooks/useAuth.jsx';
import { hasAccess } from '@/utils';
import AdminUsers from './users/AdminUsers.jsx';
import SuperAdmin from './admin/SuperAdmin.jsx';

function Protected({ children, pageName }) {
    const { isReady, session, role } = useAuth();
    if (!isReady) return null; // optionally a loader
    if (!session) return <Navigate to="/login" replace />;
    if (pageName && !hasAccess(role, pageName)) {
        // Render a simple 403 page instead of redirecting to Dashboard
        return (
            <div className="p-8">
                <div className="max-w-3xl mx-auto text-center space-y-3">
                    <h2 className="text-2xl font-bold">Acesso negado</h2>
                    <p className="text-gray-600">Você não tem permissão para visualizar esta página.</p>
                    <a href="/" className="text-blue-600 hover:underline">Voltar ao Dashboard</a>
                </div>
            </div>
        );
    }
    return children;
}

const PAGES = {
    
    Dashboard: Dashboard,
    
    Customers: Customers,
    
    Vehicles: Vehicles,
    
    ServiceCatalog: ServiceCatalog,
    
    Quotes: Quotes,
    
    NewQuote: NewQuote,
    
    QuoteDetail: QuoteDetail,
    
    ServiceOrders: ServiceOrders,
    
    Suppliers: Suppliers,
    
    VehicleHistory: VehicleHistory,
    
    VehicleSearch: VehicleSearch,
    
    PendingPayments: PendingPayments,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <Protected>
                  <Layout currentPageName={currentPage}>
                    <Routes>
                      <Route path="/" element={<Protected pageName="Dashboard"><Dashboard /></Protected>} />
                      <Route path="/Dashboard" element={<Protected pageName="Dashboard"><Dashboard /></Protected>} />
                      <Route path="/Customers" element={<Protected pageName="Customers"><Customers /></Protected>} />
                      <Route path="/Vehicles" element={<Protected pageName="Vehicles"><Vehicles /></Protected>} />
                      <Route path="/ServiceCatalog" element={<Protected pageName="ServiceCatalog"><ServiceCatalog /></Protected>} />
                      <Route path="/Quotes" element={<Protected pageName="Quotes"><Quotes /></Protected>} />
                      <Route path="/NewQuote" element={<Protected pageName="NewQuote"><NewQuote /></Protected>} />
                      <Route path="/QuoteDetail" element={<Protected pageName="QuoteDetail"><QuoteDetail /></Protected>} />
                      <Route path="/ServiceOrders" element={<Protected pageName="ServiceOrders"><ServiceOrders /></Protected>} />
                      <Route path="/Suppliers" element={<Protected pageName="Suppliers"><Suppliers /></Protected>} />
                      <Route path="/VehicleHistory" element={<Protected pageName="VehicleHistory"><VehicleHistory /></Protected>} />
                      <Route path="/VehicleSearch" element={<Protected pageName="VehicleSearch"><VehicleSearch /></Protected>} />
                      <Route path="/PendingPayments" element={<Protected pageName="PendingPayments"><PendingPayments /></Protected>} />
                      <Route path="/admin/users" element={<Protected pageName="AdminUsers"><AdminUsers /></Protected>} />
                      <Route path="/admin/super" element={<Protected pageName="Dashboard"><SuperAdmin /></Protected>} />
                    </Routes>
                  </Layout>
                </Protected>
              }
            />
        </Routes>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
