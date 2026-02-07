import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatsCard({ title, value, subtitle, icon: Icon, iconColor, bgColor, loading, className = "", onClick }) {
  if (loading) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader className="p-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-12 w-24 mt-2" />
        </CardHeader>
      </Card>
    );
  }

  const CardWrapper = onClick ? 'button' : 'div';
  const wrapperProps = onClick ? { onClick, className: 'w-full text-left' } : {};

  return (
    <Card className={`relative overflow-hidden shadow-lg border-0 hover:shadow-xl transition-all duration-300 min-w-[240px] ${onClick ? 'cursor-pointer' : ''} ${className}`}>
      <CardWrapper {...wrapperProps}>
        <div className={`absolute top-0 right-0 w-32 h-32 ${bgColor} opacity-10 rounded-full transform translate-x-16 -translate-y-16`} />
        
        {/* Ícone posicionado no extremo superior direito */}
        <div className={`absolute top-3 right-3 p-2.5 ${bgColor} rounded-xl z-10`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>

        <CardHeader className="p-6 pr-[70px]">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
            <p className="text-2xl lg:text-3xl font-bold text-gray-900 leading-tight" style={{ wordBreak: 'keep-all' }}>{value}</p>
            {subtitle && (
              <p className="text-sm text-gray-500 pt-1 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </CardHeader>
      </CardWrapper>
    </Card>
  );
}