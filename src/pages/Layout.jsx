

import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from '@/hooks/useAuth.jsx';
import {
  LayoutDashboard,
  Users,
  FileText,
  Wrench,
  Menu,
  X,
  Search,
  Zap,
  Wifi,
  WifiOff
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

function buildNavigationItems(role, user) {
  const base = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
  },
  {
    title: "Consulta de Placa",
    url: createPageUrl("VehicleSearch"),
    icon: Search,
  },
  {
    title: "Clientes",
    url: createPageUrl("Customers"),
    icon: Users,
  },
  {
    title: "Cotações",
    url: createPageUrl("Quotes"),
    icon: FileText,
  },
  {
    title: "Ordens de Serviço",
    url: createPageUrl("ServiceOrders"),
    icon: Wrench,
  },
  {
    title: "Catálogo",
    url: createPageUrl("ServiceCatalog"),
    icon: Wrench,
  },
  {
    title: "Assistente IA",
    url: createPageUrl("AIAssistant"),
    icon: Zap,
  },
  {
    title: "Fornecedores",
    url: createPageUrl("Suppliers"),
    icon: Users,
  },
  ];
  if (role === 'admin') {
    base.push({ title: 'Usuários', url: '/admin/users', icon: Users });
  }
  const superEmail = import.meta.env.VITE_SUPERADMIN_EMAIL;
  if (superEmail && user?.email && user.email.toLowerCase() === String(superEmail).toLowerCase()) {
    base.push({ title: 'Painel Administrador', url: '/admin/super', icon: LayoutDashboard });
  }
  return base;
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { user, profile, role, tenantName, connectionStatus, signOut } = useAuth();
  const navigationItems = buildNavigationItems(role, user);
  const [lastPing, setLastPing] = useState(Date.now());

  // Monitor network connectivity - apenas eventos nativos (mais eficiente)
  useEffect(() => {
    const handleOnline = () => setLastPing(Date.now());
    const handleOffline = () => {};
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Verificação inicial
    setLastPing(Date.now());
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <SidebarProvider>
      <style>
        {`
          :root {
            --primary: 220 85% 50%;
            --primary-dark: 220 85% 40%;
            --accent: 25 95% 55%;
            --background: 220 15% 98%;
            --card: 0 0% 100%;
            --foreground: 220 15% 15%;
          }

          body {
            background: linear-gradient(135deg, hsl(var(--background)) 0%, hsl(220 15% 95%) 100%);
          }
        `}
      </style>
      <div className="min-h-screen flex w-full">
        <Sidebar className="border-r border-gray-200 bg-white/80 backdrop-blur-sm">
          <SidebarHeader className="border-b border-gray-200 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
                <Wrench className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-gray-900">KDL Manager</h2>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-3">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 mb-1">
                Menu Principal
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        className={`hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 rounded-xl mb-1 ${
                          location.pathname === item.url ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 hover:text-white shadow-md' : ''
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-4 py-3">
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="hover:bg-gray-100 p-2 rounded-lg transition-colors duration-200 md:hidden" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                    <Wrench className="w-4 h-4 text-white" />
                  </div>
                  <h1 className="text-lg font-bold text-gray-900">KDL Manager</h1>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700">
                {/* Connectivity indicator - usando connectionStatus do useAuth */}
                <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${
                  connectionStatus === 'online' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {connectionStatus === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  <span className="text-xs hidden sm:inline">
                    {connectionStatus === 'online' ? 'Online' : 'Offline'}
                  </span>
                </div>
                
                {tenantName && (
                  <span className="hidden md:inline text-gray-600 border-r border-gray-200 pr-3 mr-2">{tenantName}</span>
                )}
                {profile?.full_name && (
                  <span className="hidden sm:inline">{profile.full_name}</span>
                )}
                {role && (
                  <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">{role}</span>
                )}
                <button
                  onClick={signOut}
                  className="px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                >
                  Sair
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
